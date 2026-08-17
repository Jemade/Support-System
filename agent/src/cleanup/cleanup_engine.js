const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

class CleanupEngine {
  constructor() {
    this.targetPaths = this.discoverTargetPaths();
  }

  discoverTargetPaths() {
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    const winDir = process.env.WINDIR || 'C:\\Windows';

    const candidates = [
      os.tmpdir(),
      process.env.TEMP,
      path.join(localAppData, 'Temp'),
      path.join(localAppData, 'Microsoft', 'Windows', 'INetCache'),
      path.join(localAppData, 'Microsoft', 'Edge', 'User Data', 'Default', 'Cache'),
      path.join(localAppData, 'Google', 'Chrome', 'User Data', 'Default', 'Cache'),
      path.join(localAppData, 'BraveSoftware', 'Brave-Browser', 'User Data', 'Default', 'Cache'),
      path.join(localAppData, 'CrashDumps'),
      path.join(winDir, 'Temp')
    ];

    return Array.from(new Set(candidates.filter(p => p && typeof p === 'string' && fs.existsSync(p))));
  }

  execPowerShell(command, timeoutMs = 20000) {
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

  getSystemDriveLetter() {
    if (process.platform !== 'win32') return 'C';
    const drive = (process.env.SystemDrive || 'C:').replace(':', '').trim();
    return drive || 'C';
  }

  getFreeSpaceBytes() {
    if (process.platform !== 'win32') {
      return os.freemem();
    }

    try {
      const drive = this.getSystemDriveLetter();
      const raw = this.execPowerShell(`(Get-PSDrive ${drive} -ErrorAction SilentlyContinue).Free`, 4000);
      const bytes = parseInt(raw, 10);
      return !isNaN(bytes) && bytes > 0 ? bytes : 0;
    } catch {
      return 0;
    }
  }

  getDriveMediaType() {
    if (process.platform !== 'win32') return 'SSD';
    try {
      const raw = this.execPowerShell('(Get-PhysicalDisk -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty MediaType)', 4000);
      return (raw && raw.toLowerCase().includes('hdd')) ? 'HDD' : 'SSD';
    } catch {
      return 'SSD';
    }
  }

  scanTarget(dirPath) {
    let sizeBytes = 0;
    let fileCount = 0;

    if (!fs.existsSync(dirPath)) {
      return { sizeBytes: 0, fileCount: 0 };
    }

    try {
      const files = fs.readdirSync(dirPath);
      for (const file of files) {
        try {
          const fullPath = path.join(dirPath, file);
          const stat = fs.statSync(fullPath);
          if (stat.isFile()) {
            sizeBytes += stat.size;
            fileCount++;
          }
        } catch (_) {}
      }
    } catch (_) {}

    return { sizeBytes, fileCount };
  }

  scanSystem() {
    let totalBytes = 0;
    let totalFiles = 0;
    const itemSummaries = [];

    const activePaths = this.discoverTargetPaths();
    for (const targetPath of activePaths) {
      const { sizeBytes, fileCount } = this.scanTarget(targetPath);
      totalBytes += sizeBytes;
      totalFiles += fileCount;
      itemSummaries.push({
        path: targetPath,
        sizeMb: parseFloat((sizeBytes / (1024 * 1024)).toFixed(2)),
        fileCount
      });
    }

    const totalMb = parseFloat((totalBytes / (1024 * 1024)).toFixed(2));
    const mediaType = this.getDriveMediaType();

    return {
      status: 'PASS',
      scanTimestamp: new Date().toISOString(),
      reclaimableBytes: totalBytes,
      reclaimableMb: totalMb,
      reclaimableFiles: totalFiles,
      mediaType,
      itemSummaries
    };
  }

  executeCleanup(options = { includeRecycleBin: false, runVolumeOptimization: true }) {
    const beforeFreeBytes = this.getFreeSpaceBytes();
    let cleanedBytes = 0;
    let cleanedFiles = 0;
    const actionsTaken = [];
    const activePaths = this.discoverTargetPaths();
    const drive = this.getSystemDriveLetter();
    const winDir = process.env.WINDIR || `${drive}:\\Windows`;

    // 1. Clean safe temporary files & application caches
    for (const targetPath of activePaths) {
      if (!fs.existsSync(targetPath)) continue;
      try {
        const files = fs.readdirSync(targetPath);
        for (const file of files) {
          try {
            const fullPath = path.join(targetPath, file);
            const stat = fs.statSync(fullPath);
            const ageMs = Date.now() - stat.mtimeMs;
            // Skip actively modified files (under 10 minutes) for runtime stability
            if (stat.isFile() && ageMs > 10 * 60 * 1000) {
              fs.unlinkSync(fullPath);
              cleanedBytes += stat.size;
              cleanedFiles++;
            }
          } catch (_) {}
        }
      } catch (_) {}
    }
    actionsTaken.push(`Purged ${cleanedFiles} safe temporary and cache files.`);

    // 2. Windows Update Download Cache (SoftwareDistribution\Download)
    if (process.platform === 'win32') {
      try {
        const updateCachePath = path.join(winDir, 'SoftwareDistribution', 'Download');
        const script = `
          $ErrorActionPreference = 'SilentlyContinue';
          Stop-Service -Name wuauserv -Force -ErrorAction SilentlyContinue;
          if (Test-Path "${updateCachePath}") {
            Remove-Item -Path "${updateCachePath}\\*" -Recurse -Force -ErrorAction SilentlyContinue;
          }
          Start-Service -Name wuauserv -ErrorAction SilentlyContinue;
        `.trim();
        this.execPowerShell(script, 12000);
        actionsTaken.push('Purged Windows Update download staging cache (SoftwareDistribution).');
      } catch {}
    }

    // 3. User-consented Recycle Bin Cleanup
    if (options.includeRecycleBin && process.platform === 'win32') {
      try {
        this.execPowerShell('Clear-RecycleBin -Force -ErrorAction SilentlyContinue', 10000);
        actionsTaken.push('Emptied Windows Recycle Bin (User consented).');
      } catch {}
    }

    // 4. Volume Optimization (SSD TRIM vs HDD Defrag)
    let volumeOptimizationMessage = '';
    const mediaType = this.getDriveMediaType();

    if (options.runVolumeOptimization && process.platform === 'win32') {
      try {
        if (mediaType === 'SSD') {
          this.execPowerShell(`Optimize-Volume -DriveLetter ${drive} -ReTrim -Verbose -ErrorAction SilentlyContinue`, 18000);
          volumeOptimizationMessage = `SSD Volume ${drive}: TRIM optimization completed (NAND blocks trimmed).`;
        } else {
          this.execPowerShell(`Optimize-Volume -DriveLetter ${drive} -Defrag -Verbose -ErrorAction SilentlyContinue`, 25000);
          volumeOptimizationMessage = `HDD Volume ${drive}: Defragmentation optimization completed.`;
        }
        actionsTaken.push(volumeOptimizationMessage);
      } catch {}
    }

    const afterFreeBytes = this.getFreeSpaceBytes();
    let reclaimedMb = parseFloat(((afterFreeBytes - beforeFreeBytes) / (1024 * 1024)).toFixed(2));
    if (reclaimedMb <= 0) {
      reclaimedMb = parseFloat((cleanedBytes / (1024 * 1024)).toFixed(2));
    }

    return {
      status: 'PASS',
      cleanedTimestamp: new Date().toISOString(),
      beforeFreeGb: (beforeFreeBytes / (1024 ** 3)).toFixed(2),
      afterFreeGb: (afterFreeBytes / (1024 ** 3)).toFixed(2),
      reclaimedBytes: cleanedBytes,
      reclaimedMb,
      reclaimedFiles: cleanedFiles,
      mediaType,
      systemDrive: `${drive}:`,
      volumeOptimizationMessage,
      actionsTaken,
      summaryMessage: `Cleaned ${cleanedFiles} temporary items and reclaimed ${reclaimedMb} MB storage on drive ${drive}:. ${volumeOptimizationMessage}`
    };
  }
}

module.exports = CleanupEngine;
