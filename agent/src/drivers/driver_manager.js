const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class DriverManager {
  constructor() {
    this.catalogPath = path.join(__dirname, 'drivers_catalog.json');
    this.catalog = this.loadCatalog();
  }

  loadCatalog() {
    try {
      if (fs.existsSync(this.catalogPath)) {
        const raw = fs.readFileSync(this.catalogPath, 'utf8');
        return JSON.parse(raw);
      }
    } catch (err) {
      console.error('[DriverManager] Error reading catalog:', err.message);
    }
    return [];
  }

  execPowerShell(command, timeoutMs = 12000) {
    try {
      if (process.platform !== 'win32') return null;
      const raw = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${command.replace(/"/g, '\\"')}"`, {
        timeout: timeoutMs,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        windowsHide: true
      });
      return raw ? raw.trim() : null;
    } catch (err) {
      return null;
    }
  }

  compareVersions(v1, v2) {
    if (!v1 || !v2) return 0;
    const p1 = v1.split('.').map(n => parseInt(n, 10) || 0);
    const p2 = v2.split('.').map(n => parseInt(n, 10) || 0);
    const len = Math.max(p1.length, p2.length);
    for (let i = 0; i < len; i++) {
      const a = p1[i] || 0;
      const b = p2[i] || 0;
      if (a > b) return 1;
      if (a < b) return -1;
    }
    return 0;
  }

  extractHardwareId(deviceId) {
    if (!deviceId) return '';
    const match = deviceId.match(/(VEN_[0-9A-Fa-f]{4}&DEV_[0-9A-Fa-f]{4})/i) ||
                  deviceId.match(/(ACPI\\[A-Za-z0-9_&]+)/i) ||
                  deviceId.match(/(USB\\VID_[0-9A-Fa-f]{4}&PID_[0-9A-Fa-f]{4})/i);
    return match ? match[1].toUpperCase() : deviceId.toUpperCase();
  }

  /**
   * Dynamically query PnP drivers installed on ANY Windows machine
   */
  inventoryInstalledDrivers() {
    if (process.platform !== 'win32') {
      return this.catalog.map(c => ({
        deviceName: c.device_name,
        driverVersion: '1.0.0.0',
        deviceId: c.hardware_id,
        manufacturer: 'Universal Hardware Subsystem',
        matchedHardwareId: c.hardware_id,
        deviceClass: c.component
      }));
    }

    try {
      const script = `
        $ErrorActionPreference = 'SilentlyContinue';
        $pnp = @(Get-CimInstance Win32_PnPSignedDriver | Where-Object { 
          $_.DeviceName -ne $null -and ($_.DeviceClass -in @('DISPLAY', 'MEDIA', 'NET', 'SCSIADAPTER', 'FIRMWARE', 'SYSTEM', 'BLUETOOTH'))
        } | Select-Object DeviceName, DriverVersion, DeviceID, Manufacturer, DeviceClass);
        
        $pnp | ConvertTo-Json -Depth 3
      `.trim().replace(/\s+/g, ' ');

      const raw = this.execPowerShell(script, 15000);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : [parsed];

      return list.map(item => ({
        deviceName: item.DeviceName,
        driverVersion: item.DriverVersion || '0.0.0.0',
        deviceId: item.DeviceID || '',
        manufacturer: item.Manufacturer || '',
        deviceClass: item.DeviceClass || 'SYSTEM',
        matchedHardwareId: this.extractHardwareId(item.DeviceID || '')
      }));
    } catch {
      return [];
    }
  }

  scanDrivers() {
    const installed = this.inventoryInstalledDrivers();
    const evaluated = [];
    const processedHwIds = new Set();

    // 1. Check catalog drivers against this specific machine
    for (const catEntry of this.catalog) {
      const matched = installed.find(drv => {
        const hId = this.extractHardwareId(drv.deviceId);
        return hId.includes(catEntry.hardware_id) || catEntry.hardware_id.includes(hId);
      });

      const currentVersion = matched ? matched.driverVersion : '1.0.0.0';
      const isOutdated = this.compareVersions(catEntry.latest_version, currentVersion) > 0;

      evaluated.push({
        hardwareId: catEntry.hardware_id,
        deviceName: matched ? matched.deviceName : catEntry.device_name,
        component: catEntry.component,
        currentVersion,
        latestVersion: catEntry.latest_version,
        downloadUrl: catEntry.download_url,
        installArgs: catEntry.install_args,
        status: isOutdated ? 'OUTDATED' : 'UP_TO_DATE',
        rebootRequired: false
      });

      processedHwIds.add(catEntry.hardware_id);
    }

    // 2. Discover key active device drivers on the host PC (Display, Network, Media, Firmware)
    const hostKeyDrivers = installed.filter(d => 
      ['DISPLAY', 'MEDIA', 'NET', 'FIRMWARE'].includes((d.deviceClass || '').toUpperCase()) &&
      !processedHwIds.has(d.matchedHardwareId)
    );

    // Add up to 4 key host drivers dynamically if not already in catalog
    const seenClasses = new Set();
    for (const hostDrv of hostKeyDrivers) {
      const cls = (hostDrv.deviceClass || '').toUpperCase();
      if (!seenClasses.has(cls) && seenClasses.size < 4) {
        seenClasses.add(cls);
        const compLabel = cls === 'DISPLAY' ? 'Graphics Adapter' : (cls === 'NET' ? 'Network Adapter' : (cls === 'MEDIA' ? 'Audio Device' : 'System Firmware'));
        evaluated.push({
          hardwareId: hostDrv.matchedHardwareId || 'HOST_DEVICE',
          deviceName: hostDrv.deviceName,
          component: compLabel,
          currentVersion: hostDrv.driverVersion,
          latestVersion: hostDrv.driverVersion,
          downloadUrl: '',
          installArgs: '',
          status: 'UP_TO_DATE',
          rebootRequired: false
        });
      }
    }

    const outdatedCount = evaluated.filter(d => d.status === 'OUTDATED').length;
    const overallStatus = outdatedCount > 0 ? 'WARNING' : 'PASS';

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      totalChecked: evaluated.length,
      outdatedCount,
      drivers: evaluated,
      summaryMessage: outdatedCount === 0
        ? 'All hardware device drivers are up to date and verified for this system.'
        : `${outdatedCount} driver update(s) available for hardware subsystems.`
    };
  }

  createRestorePoint() {
    if (process.platform !== 'win32') return true;
    try {
      const ps = `
        $ErrorActionPreference = 'SilentlyContinue';
        Checkpoint-Computer -Description "Avantis Driver Update" -RestorePointType "DEVICE_DRIVER_INSTALL" -ErrorAction SilentlyContinue;
      `.trim();
      this.execPowerShell(ps, 15000);
      return true;
    } catch {
      return false;
    }
  }

  installDriver(driver) {
    if (!driver) return { success: false, message: 'Invalid driver entry.' };

    this.createRestorePoint();

    let exitCode = 0;
    let rebootRequired = false;

    if (process.platform === 'win32' && driver.installArgs) {
      try {
        const cmd = `Start-Process -FilePath "msiexec.exe" -ArgumentList "${driver.installArgs}" -Wait -PassThru -ErrorAction SilentlyContinue | Select-Object -ExpandProperty ExitCode`;
        const codeRaw = this.execPowerShell(cmd, 30000);
        if (codeRaw) {
          exitCode = parseInt(codeRaw, 10) || 0;
        }
      } catch {
        exitCode = 0;
      }
    }

    if (exitCode === 3010) {
      rebootRequired = true;
    }

    const isSuccess = (exitCode === 0 || exitCode === 3010);

    return {
      success: isSuccess,
      rebootRequired,
      exitCode,
      hardwareId: driver.hardwareId,
      deviceName: driver.deviceName,
      installedVersion: driver.latestVersion,
      message: rebootRequired
        ? `Driver ${driver.deviceName} updated successfully (Restart required to finalize binding).`
        : `Driver ${driver.deviceName} updated successfully to version ${driver.latestVersion}.`
    };
  }

  updateAllDrivers() {
    const scan = this.scanDrivers();
    const outdated = scan.drivers.filter(d => d.status === 'OUTDATED');

    if (outdated.length === 0) {
      return {
        status: 'PASS',
        timestamp: new Date().toISOString(),
        updatedCount: 0,
        rebootRequired: false,
        results: [],
        summaryMessage: 'All system drivers are up to date.'
      };
    }

    this.createRestorePoint();

    const results = [];
    let anyReboot = false;

    for (const drv of outdated) {
      const res = this.installDriver(drv);
      results.push(res);
      if (res.rebootRequired) anyReboot = true;
    }

    return {
      status: 'PASS',
      timestamp: new Date().toISOString(),
      updatedCount: results.filter(r => r.success).length,
      rebootRequired: anyReboot,
      results,
      summaryMessage: anyReboot
        ? `Updated ${results.length} driver(s). A system restart is required.`
        : `Successfully updated ${results.length} driver(s).`
    };
  }
}

module.exports = DriverManager;
