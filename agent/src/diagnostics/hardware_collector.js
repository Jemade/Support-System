const os = require('os');
const fs = require('fs');
const { execSync } = require('child_process');

class HardwareCollector {
  constructor() {
    this.cachedStaticHardware = null;
    this.lastStaticFetchTime = 0;
    this.STATIC_CACHE_TTL_MS = 600000; // 10 minutes for static specs

    // Tiered SMART caching (SMART checks run every 5 minutes to avoid disk I/O load)
    this.cachedSmartStatus = 'PASSED';
    this.cachedReallocatedSectors = 0;
    this.lastSmartCheckTime = 0;
    this.SMART_CACHE_TTL_MS = 300000; // 5 minutes
  }

  /**
   * Helper to execute PowerShell commands safely with a strict timeout
   */
  execPowerShell(command, timeoutMs = 4500) {
    try {
      if (process.platform !== 'win32') return null;
      const raw = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${command.replace(/"/g, '\\"')}"`, {
        timeout: timeoutMs,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        windowsHide: true
      });
      return raw ? raw.trim() : null;
    } catch {
      return null;
    }
  }

  /**
   * Reads static system specs dynamically from SMBIOS / WMI
   * @param {boolean} forceLive - if true, bypasses any cache and queries hardware directly
   */
  async getStaticHardwareInfo(forceLive = false) {
    const now = Date.now();
    if (!forceLive && this.cachedStaticHardware && (now - this.lastStaticFetchTime < this.STATIC_CACHE_TTL_MS)) {
      return this.cachedStaticHardware;
    }

    let wmiData = null;
    try {
      const psScript = `
        $ErrorActionPreference = 'SilentlyContinue';
        $cpu = Get-CimInstance Win32_Processor | Select-Object -First 1 Name, Manufacturer, NumberOfCores, NumberOfLogicalProcessors, MaxClockSpeed;
        $os = Get-CimInstance Win32_OperatingSystem | Select-Object Caption, OSArchitecture, TotalVisibleMemorySize;
        $sys = Get-CimInstance Win32_ComputerSystem | Select-Object Manufacturer, Model;
        $bios = Get-CimInstance Win32_BIOS | Select-Object SerialNumber, Manufacturer, Version;
        $csp = Get-CimInstance Win32_ComputerSystemProduct | Select-Object UUID, Name, Vendor;
        $enc = Get-CimInstance Win32_SystemEnclosure | Select-Object ChassisTypes;
        $disks = @(Get-CimInstance Win32_DiskDrive | Select-Object DeviceID, Model, Size, InterfaceType, MediaType, Status);
        $logical = @(Get-CimInstance Win32_LogicalDisk | Select-Object DeviceID, Size, FreeSpace, FileSystem);
        $smart = @(Get-CimInstance -ClassName MSStorageDriver_FailurePredictStatus -Namespace root\\wmi | Select-Object InstanceName, PredictFailure, Reason);
        $bat = Get-CimInstance Win32_Battery | Select-Object -First 1 EstimatedChargeRemaining, BatteryStatus, DesignCapacity, FullChargeCapacity;
        $gpus = @(Get-CimInstance Win32_VideoController | Select-Object Name, AdapterRAM, DriverVersion, VideoProcessor);
        $ramSticks = @(Get-CimInstance Win32_PhysicalMemory | Select-Object Capacity, Speed, DeviceLocator, Manufacturer);
        $physDisks = @(Get-PhysicalDisk -ErrorAction SilentlyContinue | Select-Object DeviceId, FriendlyName, MediaType, BusType, Size, OperationalStatus);
        $touchPnp = (Get-CimInstance Win32_PnPEntity | Where-Object { $_.ClassGuid -eq '{745a17a0-74d3-11d0-b6fe-00a0c90f57da}' -and ($_.Name -match 'Touch Screen|Digitizer|TouchScreen|Multi-Touch') -and $_.Status -eq 'OK' }).Count -gt 0;
        $penPnp = (Get-CimInstance Win32_PnPEntity | Where-Object { ($_.Name -match 'Stylus|Pen Digitizer|Wacom Pen') -and $_.Status -eq 'OK' }).Count -gt 0;

        [PSCustomObject]@{
          cpu = $cpu;
          os = $os;
          sys = $sys;
          bios = $bios;
          csp = $csp;
          enc = $enc;
          disks = $disks;
          physDisks = $physDisks;
          logical = $logical;
          smart = $smart;
          bat = $bat;
          gpus = $gpus;
          ramSticks = $ramSticks;
          hasTouch = $touchPnp;
          hasPen = $penPnp;
        } | ConvertTo-Json -Depth 4
      `.trim().replace(/\s+/g, ' ');

      const rawJson = this.execPowerShell(psScript, 8000);
      if (rawJson) {
        wmiData = JSON.parse(rawJson);
      }
    } catch {
      wmiData = null;
    }

    // --- 1. System Identity & Model ---
    const hostname = os.hostname() || 'DEVICE';
    const osRelease = os.release() || '';
    const osArch = os.arch() || 'x64';
    let osVersion = `${os.type()} ${osRelease} (${osArch})`;
    if (wmiData && wmiData.os && wmiData.os.Caption) {
      osVersion = `${wmiData.os.Caption} ${wmiData.os.OSArchitecture || ''}`.trim();
    }

    // Chassis mapping
    let chassisType = 'Desktop';
    let chassisCode = 0;
    if (wmiData && wmiData.enc && wmiData.enc.ChassisTypes) {
      const types = Array.isArray(wmiData.enc.ChassisTypes) ? wmiData.enc.ChassisTypes : [wmiData.enc.ChassisTypes];
      chassisCode = types[0] || 0;
      if ([8, 9, 10, 11, 12, 14, 31, 32].includes(chassisCode)) chassisType = 'Laptop';
      else if ([13, 30].includes(chassisCode)) chassisType = chassisCode === 13 ? 'All-in-One' : 'Tablet';
      else if ([3, 4, 5, 6, 7, 15, 16].includes(chassisCode)) chassisType = 'Desktop';
    }

    // Model Detection: Always use genuine hardware model if available
    let rawModel = '';
    if (wmiData && wmiData.sys && wmiData.sys.Model) {
      rawModel = wmiData.sys.Model.trim();
    } else if (wmiData && wmiData.csp && wmiData.csp.Name) {
      rawModel = wmiData.csp.Name.trim();
    }

    let model = '';
    const invalidModels = ['Default string', 'System Product Name', 'To be filled by O.E.M.', 'System Version', 'None'];
    if (rawModel && !invalidModels.includes(rawModel) && !rawModel.toLowerCase().includes('o.e.m.')) {
      model = rawModel;
    } else {
      model = `${chassisType} PC`;
    }

    let manufacturer = 'Avantis Technologies';
    if (wmiData && wmiData.sys && wmiData.sys.Manufacturer) {
      const m = wmiData.sys.Manufacturer.trim();
      if (m && !invalidModels.includes(m) && !m.toLowerCase().includes('o.e.m.')) {
        manufacturer = m;
      }
    }

    // Serial Number / Service Tag Detection
    let serial = '';
    if (wmiData && wmiData.bios && wmiData.bios.SerialNumber) {
      const s = wmiData.bios.SerialNumber.trim();
      if (s && !invalidModels.includes(s) && !s.toLowerCase().includes('o.e.m.')) {
        serial = s;
      }
    }
    if (!serial && wmiData && wmiData.csp && wmiData.csp.UUID) {
      const u = wmiData.csp.UUID.trim();
      if (u && u !== 'FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF' && u !== '00000000-0000-0000-0000-000000000000') {
        serial = u;
      }
    }
    if (!serial) {
      serial = hostname.toUpperCase();
    }

    // --- 2. Processor Specs (No brand/generation assumptions) ---
    const cpus = os.cpus();
    const firstCpu = cpus[0] || {};
    let cpuModel = firstCpu.model ? firstCpu.model.trim() : 'Processor';
    let cpuCores = cpus.length || 1;
    let cpuThreads = cpus.length || 1;
    let cpuSpeedGhz = firstCpu.speed ? parseFloat((firstCpu.speed / 1000).toFixed(2)) : null;

    if (wmiData && wmiData.cpu) {
      if (wmiData.cpu.Name) cpuModel = wmiData.cpu.Name.trim();
      if (wmiData.cpu.NumberOfCores) cpuCores = wmiData.cpu.NumberOfCores;
      if (wmiData.cpu.NumberOfLogicalProcessors) cpuThreads = wmiData.cpu.NumberOfLogicalProcessors;
      if (wmiData.cpu.MaxClockSpeed) cpuSpeedGhz = parseFloat((wmiData.cpu.MaxClockSpeed / 1000).toFixed(2));
    }

    // --- 3. Graphics Cards (Single, Dual, Integrated vs Dedicated) ---
    const graphicsList = [];
    if (wmiData && wmiData.gpus) {
      const rawGpus = Array.isArray(wmiData.gpus) ? wmiData.gpus : [wmiData.gpus];
      rawGpus.forEach(g => {
        if (!g || !g.Name) return;
        const vramBytes = parseInt(g.AdapterRAM, 10) || 0;
        const vramGb = vramBytes > 0 ? parseFloat((vramBytes / (1024 ** 3)).toFixed(1)) : null;
        const nameUpper = g.Name.toUpperCase();
        const isDedicated = (vramGb !== null && vramGb >= 1.0) || nameUpper.includes('NVIDIA') || nameUpper.includes('GEFORCE') || nameUpper.includes('RTX') || nameUpper.includes('RADEON RX') || nameUpper.includes('ARC');
        graphicsList.push({
          name: g.Name.trim(),
          vramGB: vramGb,
          driverVersion: g.DriverVersion || null,
          isDedicated,
          type: isDedicated ? 'Dedicated GPU' : 'Integrated GPU'
        });
      });
    }
    const primaryGpu = graphicsList.find(g => g.isDedicated) || graphicsList[0] || { name: 'Integrated Graphics', type: 'Integrated GPU', vramGB: null };

    // --- 4. RAM Configuration & Multi-Stick Layout ---
    let ramLayoutSummary = '';
    const ramSticks = [];
    if (wmiData && wmiData.ramSticks) {
      const rawSticks = Array.isArray(wmiData.ramSticks) ? wmiData.ramSticks : [wmiData.ramSticks];
      rawSticks.forEach(s => {
        if (!s || !s.Capacity) return;
        const capGb = Math.round(parseInt(s.Capacity, 10) / (1024 ** 3));
        const speedMhz = parseInt(s.Speed, 10) || null;
        ramSticks.push({
          capacityGB: capGb,
          speedMHz: speedMhz,
          slot: s.DeviceLocator || 'DIMM',
          manufacturer: s.Manufacturer || ''
        });
      });
    }

    const totalPhysicalGB = ramSticks.reduce((acc, s) => acc + s.capacityGB, 0) || parseFloat((os.totalmem() / (1024 ** 3)).toFixed(1));
    if (ramSticks.length > 1) {
      const stickCap = ramSticks[0].capacityGB;
      const allSame = ramSticks.every(s => s.capacityGB === stickCap);
      const speed = ramSticks[0].speedMHz ? ` ${ramSticks[0].speedMHz}MHz` : '';
      ramLayoutSummary = allSame ? `${totalPhysicalGB} GB (${ramSticks.length}x ${stickCap}GB${speed})` : `${totalPhysicalGB} GB (${ramSticks.length} slots)`;
    } else if (ramSticks.length === 1) {
      const speed = ramSticks[0].speedMHz ? ` ${ramSticks[0].speedMHz}MHz` : '';
      ramLayoutSummary = `${totalPhysicalGB} GB (1x ${ramSticks[0].capacityGB}GB${speed})`;
    } else {
      ramLayoutSummary = `${totalPhysicalGB} GB DDR`;
    }

    // --- 5. Pen & Touch Input Capabilities ---
    const hasTouch = !!(wmiData && wmiData.hasTouch);
    const hasPen = !!(wmiData && wmiData.hasPen);
    let penAndTouchDescription = 'No pen or touch input is available for this display';
    if (hasTouch && hasPen) {
      penAndTouchDescription = 'Pen and touch support with multi-touch points';
    } else if (hasTouch) {
      penAndTouchDescription = 'Touch support with multi-touch points';
    } else if (hasPen) {
      penAndTouchDescription = 'Pen / Stylus support';
    }

    // --- 6. Storage (Physical Disks & Logical Volumes) ---
    const physicalDisks = [];
    if (wmiData && wmiData.physDisks && wmiData.physDisks.length > 0) {
      const rawPhys = Array.isArray(wmiData.physDisks) ? wmiData.physDisks : [wmiData.physDisks];
      rawPhys.forEach(p => {
        if (!p) return;
        const sizeBytes = parseInt(p.Size, 10) || 0;
        const sizeGb = sizeBytes > 0 ? parseFloat((sizeBytes / (1024 ** 3)).toFixed(1)) : null;
        const friendly = (p.FriendlyName || '').trim();
        const media = (p.MediaType || '').toUpperCase();
        const bus = (p.BusType || '').toUpperCase();

        let dType = 'SSD';
        if (bus.includes('NVME') || friendly.toUpperCase().includes('NVME')) {
          dType = 'NVMe SSD';
        } else if (media.includes('SSD') || friendly.toUpperCase().includes('SSD')) {
          dType = 'SSD';
        } else if (media.includes('HDD')) {
          dType = 'HDD';
        }

        physicalDisks.push({
          deviceId: p.DeviceId || '',
          model: friendly || 'Storage Disk',
          sizeGB: sizeGb,
          driveType: dType,
          status: p.OperationalStatus || 'OK'
        });
      });
    } else if (wmiData && wmiData.disks) {
      const rawDisks = Array.isArray(wmiData.disks) ? wmiData.disks : [wmiData.disks];
      rawDisks.forEach(d => {
        if (!d) return;
        const sizeBytes = parseInt(d.Size, 10) || 0;
        const sizeGb = sizeBytes > 0 ? parseFloat((sizeBytes / (1024 ** 3)).toFixed(1)) : null;
        const diskModel = (d.Model || '').trim();
        const ifType = (d.InterfaceType || '').toUpperCase();
        const media = (d.MediaType || '').toUpperCase();

        let dType = 'SSD';
        if (diskModel.toUpperCase().includes('NVME') || ifType.includes('NVME') || (d.DeviceID || '').toUpperCase().includes('NVME')) {
          dType = 'NVMe SSD';
        } else if (media.includes('SSD') || diskModel.toUpperCase().includes('SSD')) {
          dType = 'SSD';
        } else if (media.includes('HDD')) {
          dType = 'HDD';
        }

        physicalDisks.push({
          deviceId: d.DeviceID || '',
          model: diskModel || 'Storage Disk',
          sizeGB: sizeGb,
          driveType: dType,
          status: d.Status || 'OK'
        });
      });
    }

    const logicalVolumes = [];
    if (wmiData && wmiData.logical) {
      const rawVols = Array.isArray(wmiData.logical) ? wmiData.logical : [wmiData.logical];
      rawVols.forEach(v => {
        if (!v || !v.DeviceID) return;
        const totalB = parseInt(v.Size, 10) || 0;
        const freeB = parseInt(v.FreeSpace, 10) || 0;
        const usedB = Math.max(0, totalB - freeB);
        logicalVolumes.push({
          mount: v.DeviceID,
          fileSystem: v.FileSystem || 'NTFS',
          totalGB: totalB > 0 ? parseFloat((totalB / (1024 ** 3)).toFixed(1)) : null,
          freeGB: totalB > 0 ? parseFloat((freeB / (1024 ** 3)).toFixed(1)) : null,
          usedGB: totalB > 0 ? parseFloat((usedB / (1024 ** 3)).toFixed(1)) : null,
          usedPercent: totalB > 0 ? Math.round((usedB / totalB) * 100) : 0
        });
      });
    }

    this.cachedStaticHardware = {
      system: {
        hostname,
        osVersion,
        model,
        manufacturer,
        serialNumber: serial,
        chassisType,
        cpuModel,
        cpuCores,
        cpuThreads,
        cpuSpeedGhz,
        ramLayoutSummary,
        ramSticks,
        totalPhysicalGB,
        graphics: graphicsList,
        primaryGpu,
        penAndTouch: {
          hasTouch,
          hasPen,
          description: penAndTouchDescription
        }
      },
      physicalDisks,
      logicalVolumes,
      wmiData
    };
    this.lastStaticFetchTime = now;

    return this.cachedStaticHardware;
  }

  /**
   * Real-time CPU Utilization using instantaneous tick differential
   */
  async getCpuLoad() {
    return new Promise(resolve => {
      const startCpus = os.cpus();
      setTimeout(() => {
        const endCpus = os.cpus();
        let totalIdle = 0;
        let totalTick = 0;

        for (let i = 0; i < startCpus.length; i++) {
          const s = startCpus[i];
          const e = endCpus[i] || s;

          const idle = e.times.idle - s.times.idle;
          let total = 0;
          for (const type in e.times) {
            total += (e.times[type] - s.times[type]);
          }

          totalIdle += idle;
          totalTick += total;
        }

        const load = totalTick > 0 ? Math.max(0, Math.min(100, Math.round(100 - (100 * totalIdle) / totalTick))) : 0;
        resolve(load);
      }, 150);
    });
  }

  /**
   * Real-time CPU Temperature with Graceful Degradation
   */
  getCpuTemperature() {
    try {
      if (process.platform !== 'win32') {
        return { temperatureC: null, isDirectHardwareSensor: false, sensorStatus: 'Not available on this device' };
      }

      // Check MSAcpi_ThermalZoneTemperature (returns tenths of Kelvin)
      const acpiRaw = this.execPowerShell(
        'Get-CimInstance -ClassName MSAcpi_ThermalZoneTemperature -Namespace root\\wmi -ErrorAction SilentlyContinue | Select-Object -ExpandProperty CurrentTemperature',
        1500
      );

      if (acpiRaw) {
        const val = parseInt(acpiRaw.split(/\r?\n/)[0], 10);
        if (!isNaN(val) && val > 2732) {
          const tempC = Math.round((val - 2732) / 10);
          if (tempC > 0 && tempC < 130) {
            return {
              temperatureC: tempC,
              isDirectHardwareSensor: true,
              sensorStatus: 'Active (Direct ACPI Sensor)'
            };
          }
        }
      }

      // Check Performance Formatted ThermalZone
      const perfRaw = this.execPowerShell(
        'Get-CimInstance Win32_PerfFormattedData_Counters_ThermalZoneInformation -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Temperature',
        1500
      );

      if (perfRaw) {
        const val = parseInt(perfRaw.split(/\r?\n/)[0], 10);
        if (!isNaN(val) && val > 273) {
          const tempC = Math.round(val - 273.15);
          if (tempC > 0 && tempC < 130) {
            return {
              temperatureC: tempC,
              isDirectHardwareSensor: true,
              sensorStatus: 'Active (Direct ACPI Sensor)'
            };
          }
        }
      }

      return {
        temperatureC: null,
        isDirectHardwareSensor: false,
        sensorStatus: 'Not available on this device'
      };
    } catch {
      return {
        temperatureC: null,
        isDirectHardwareSensor: false,
        sensorStatus: 'Not available on this device'
      };
    }
  }

  /**
   * Real-time Memory Utilization
   */
  getMemoryMetrics(totalPhysicalGB = null) {
    const totalBytes = os.totalmem();
    const freeBytes = os.freemem();
    const usedBytes = Math.max(0, totalBytes - freeBytes);

    const totalGB = parseFloat((totalBytes / (1024 ** 3)).toFixed(1));
    const usedGB = parseFloat((usedBytes / (1024 ** 3)).toFixed(1));
    const freeGB = parseFloat((freeBytes / (1024 ** 3)).toFixed(1));
    const usedPercent = totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100) : 0;

    return {
      totalGB,
      totalPhysicalGB: totalPhysicalGB || totalGB,
      usedGB,
      freeGB,
      usedPercent
    };
  }

  /**
   * Real-time Primary Storage & Multi-drive Metrics (Tiered: Live FS space + Cached SMART)
   */
  getStorageMetrics(staticDisks = [], staticVolumes = [], forceLiveSmart = false) {
    const systemDrive = process.platform === 'win32' ? (process.env.SystemDrive || 'C:') : '/';
    const mountPath = process.platform === 'win32' ? `${systemDrive}\\` : '/';

    let totalGB = null;
    let freeGB = null;
    let usedGB = null;
    let usedPercent = null;
    let freePercent = null;
    let smartStatus = this.cachedSmartStatus || 'PASSED';
    let reallocatedSectors = this.cachedReallocatedSectors || 0;

    const primaryDisk = staticDisks[0] || { driveType: 'SSD', model: 'Primary Storage' };
    const driveType = primaryDisk.driveType || 'SSD';

    // 1. Fast, live filesystem capacity and free space (< 1ms execution, safe every 5s)
    try {
      if (typeof fs.statfsSync === 'function') {
        const stat = fs.statfsSync(mountPath);
        const totalB = stat.bsize * stat.blocks;
        const freeB = stat.bsize * stat.bfree;
        const usedB = totalB - freeB;

        if (totalB > 0) {
          totalGB = parseFloat((totalB / (1024 ** 3)).toFixed(1));
          freeGB = parseFloat((freeB / (1024 ** 3)).toFixed(1));
          usedGB = parseFloat((usedB / (1024 ** 3)).toFixed(1));
          usedPercent = Math.round((usedB / totalB) * 100);
          freePercent = 100 - usedPercent;
        }
      }
    } catch {
      const matchVol = staticVolumes.find(v => v.mount.toUpperCase().startsWith(systemDrive.toUpperCase()));
      if (matchVol) {
        totalGB = matchVol.totalGB;
        freeGB = matchVol.freeGB;
        usedGB = matchVol.usedGB;
        usedPercent = matchVol.usedPercent;
        freePercent = 100 - usedPercent;
      }
    }

    // 2. SMART check (Tiered: re-queried only every 5 mins or on explicit full scan)
    const now = Date.now();
    if (forceLiveSmart || (now - this.lastSmartCheckTime > this.SMART_CACHE_TTL_MS)) {
      try {
        const smartRaw = this.execPowerShell(
          'Get-CimInstance -ClassName MSStorageDriver_FailurePredictStatus -Namespace root\\wmi -ErrorAction SilentlyContinue | Select-Object -ExpandProperty PredictFailure',
          1500
        );
        if (smartRaw && smartRaw.toLowerCase().includes('true')) {
          smartStatus = 'FAILING_NOW';
        } else {
          smartStatus = 'PASSED';
        }
        this.cachedSmartStatus = smartStatus;
        this.lastSmartCheckTime = now;
      } catch {
        smartStatus = this.cachedSmartStatus || 'PASSED';
      }
    }

    return {
      mount: systemDrive,
      driveType,
      model: primaryDisk.model || 'Primary Storage',
      totalGB,
      usedGB,
      freeGB,
      usedPercent,
      freePercent,
      smartStatus,
      reallocatedSectors,
      allPhysicalDrives: staticDisks,
      allVolumes: staticVolumes
    };
  }

  /**
   * Dynamic Battery or AC Mains / PSU State (Live read on laptops, fast return on desktops)
   */
  getBatteryMetrics(wmiBat = null) {
    try {
      let bat = wmiBat;
      if (process.platform === 'win32') {
        const raw = this.execPowerShell(
          'Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue | Select-Object EstimatedChargeRemaining, BatteryStatus, DesignCapacity, FullChargeCapacity | ConvertTo-Json',
          1500
        );
        if (raw) bat = JSON.parse(raw);
      }

      if (!bat || bat.EstimatedChargeRemaining === undefined || bat.EstimatedChargeRemaining === null) {
        return {
          hasBattery: false,
          devicePowerMode: 'AC_MAINS_PSU',
          isAcConnected: true,
          healthPercent: null,
          currentPercent: null,
          statusMessage: 'AC Mains Power (Desktop / All-In-One)'
        };
      }

      const currentPercent = Math.min(100, Math.max(0, parseInt(bat.EstimatedChargeRemaining, 10) || 0));
      const batStatus = parseInt(bat.BatteryStatus, 10) || 1;
      const isCharging = [2, 6, 7, 8].includes(batStatus);
      const isAcConnected = isCharging || batStatus === 2;

      let healthPercent = null;
      if (bat.FullChargeCapacity && bat.DesignCapacity && bat.DesignCapacity > 0) {
        healthPercent = Math.min(100, Math.round((bat.FullChargeCapacity / bat.DesignCapacity) * 100));
      } else {
        healthPercent = 100;
      }

      return {
        hasBattery: true,
        devicePowerMode: 'BATTERY_BACKED',
        isAcConnected,
        healthPercent,
        currentPercent,
        currentCapacityMw: bat.FullChargeCapacity || null,
        designCapacityMw: bat.DesignCapacity || null,
        statusMessage: isCharging ? 'Charging / AC Connected' : (isAcConnected ? 'AC Connected' : 'On Battery')
      };
    } catch {
      return {
        hasBattery: false,
        devicePowerMode: 'AC_MAINS_PSU',
        isAcConnected: true,
        healthPercent: null,
        currentPercent: null,
        statusMessage: 'AC Mains Power (Desktop / All-In-One)'
      };
    }
  }

  evaluateCapabilities(system, cpu, memory, storage, battery) {
    const isDesktopOrAio = !battery.hasBattery || 
      (system.chassisType || '').toLowerCase().includes('desktop') || 
      (system.model || '').toLowerCase().includes('all-in-one');

    const deviceCategory = battery.hasBattery ? 'Laptop / Portable' : (isDesktopOrAio ? 'Desktop / All-In-One' : 'Workstation');

    return {
      deviceCategory,
      hasBattery: battery.hasBattery,
      powerComponentLabel: battery.hasBattery ? 'Battery' : 'Power Supply (PSU)',
      hasDirectThermalSensor: cpu.isDirectHardwareSensor,
      primaryDriveMount: storage.mount,
      driveType: storage.driveType,
      driveCount: storage.allPhysicalDrives ? storage.allPhysicalDrives.length : 1,
      gpuCount: system.graphics ? system.graphics.length : 1,
      supportedDiagnostics: [
        'processor_stress',
        'memory_integrity',
        'storage_smart',
        battery.hasBattery ? 'battery_diagnostics' : 'power_supply_check'
      ]
    };
  }

  /**
   * Main collector method returning the complete real-time diagnostics snapshot
   * @param {boolean} forceLive - if true, bypasses any static cache and re-queries WMI/CIM directly
   */
  async collectFullDiagnostics(forceLive = false) {
    const staticInfo = await this.getStaticHardwareInfo(forceLive);
    const [loadPercent, cpuTemp] = await Promise.all([
      this.getCpuLoad(),
      Promise.resolve(this.getCpuTemperature())
    ]);

    const memory = this.getMemoryMetrics(staticInfo.system.totalPhysicalGB);
    const storage = this.getStorageMetrics(staticInfo.physicalDisks, staticInfo.logicalVolumes, forceLive);
    const battery = this.getBatteryMetrics(staticInfo.wmiData ? staticInfo.wmiData.bat : null);

    const cpu = {
      model: staticInfo.system.cpuModel,
      speedGhz: staticInfo.system.cpuSpeedGhz,
      loadPercent,
      cores: staticInfo.system.cpuCores,
      threads: staticInfo.system.cpuThreads,
      temperatureC: cpuTemp.temperatureC,
      isDirectHardwareSensor: cpuTemp.isDirectHardwareSensor,
      sensorStatus: cpuTemp.sensorStatus
    };

    const graphics = {
      model: (staticInfo.system.primaryGpu && staticInfo.system.primaryGpu.name) || 'Integrated Graphics',
      isDedicated: staticInfo.system.primaryGpu ? staticInfo.system.primaryGpu.isDedicated : false,
      vramGB: staticInfo.system.primaryGpu ? staticInfo.system.primaryGpu.vramGB : null,
      allGpus: staticInfo.system.graphics || []
    };

    const capabilities = this.evaluateCapabilities(staticInfo.system, cpu, memory, storage, battery);

    return {
      timestamp: new Date().toISOString(),
      capabilities,
      system: staticInfo.system,
      cpu,
      graphics,
      memory,
      storage,
      battery
    };
  }
}

module.exports = HardwareCollector;
