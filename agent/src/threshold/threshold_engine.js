class ThresholdEngine {
  evaluate(diagnostics) {
    const alerts = [];
    let overallHealthStatus = 'HEALTHY'; // HEALTHY, WARNING, CRITICAL
    let overallHealthScore = 100;

    const { cpu, memory, storage, battery, system = {} } = diagnostics;
    const physCores = (system && system.cpuCores) || (cpu && cpu.cores) || 14;
    const logThreads = (system && system.cpuThreads) || (cpu && cpu.threads) || 20;

    // ============================================
    // 1. CPU LOAD / COMPUTE SURGE EVALUATION
    // ============================================
    if (typeof cpu.loadPercent === 'number') {
      if (cpu.loadPercent >= 92) {
        if (overallHealthStatus !== 'CRITICAL') overallHealthStatus = 'CRITICAL';
        overallHealthScore -= 30;
        alerts.push({
          type: 'CPU_LOAD_CRITICAL',
          component: 'cpu',
          severity: 'CRITICAL',
          title: `Critical CPU Utilization (${cpu.loadPercent}%)`,
          metric: `${cpu.loadPercent}% CPU Load (${physCores} Cores, ${logThreads} Threads)`,
          risk: 'Sustained peak compute load causes system latency, high thermal output, and rapid battery discharge.',
          message: `Processor load is at ${cpu.loadPercent}% across ${physCores} cores (${logThreads} logical processors).`,
          precautions: [
            'Open Task Manager (Ctrl+Shift+Esc) to identify processes consuming excessive CPU.',
            'Ensure laptop cooling air intakes and exhaust vents are clear and unobstructed.',
            'Connect the AC power adapter if running heavy workloads to prevent battery voltage drops.'
          ],
          actionLabel: 'Open Troubleshoot',
          actionTab: 'troubleshoot',
          actionComponent: 'cpu'
        });
      } else if (cpu.loadPercent >= 82) {
        if (overallHealthStatus === 'HEALTHY') overallHealthStatus = 'WARNING';
        overallHealthScore -= 12;
        alerts.push({
          type: 'CPU_LOAD_WARNING',
          component: 'cpu',
          severity: 'WARNING',
          title: `High Processor Utilization (${cpu.loadPercent}%)`,
          metric: `${cpu.loadPercent}% CPU Load`,
          risk: 'Elevated processing demand will cause cooling fans to increase speed and reduce battery runtime.',
          message: `Processor load is elevated at ${cpu.loadPercent}%.`,
          precautions: [
            'Review active background applications in Task Manager.',
            'Check for pending Windows or background updates.',
            'Ensure the laptop is on a hard, flat surface to maintain airflow.'
          ],
          actionLabel: 'Open Troubleshoot',
          actionTab: 'troubleshoot',
          actionComponent: 'cpu'
        });
      }
    }

    // ============================================
    // 2. CPU TEMPERATURE / THERMAL RUNAWAY
    // ============================================
    if (typeof cpu.temperatureC === 'number' && cpu.temperatureC !== null) {
      if (cpu.temperatureC >= 92) {
        overallHealthStatus = 'CRITICAL';
        overallHealthScore -= 35;
        alerts.push({
          type: 'CPU_TEMP_CRITICAL',
          component: 'cpu',
          severity: 'CRITICAL',
          title: `Critical CPU Temperature (${cpu.temperatureC}°C)`,
          metric: `${cpu.temperatureC}°C Core Temperature`,
          risk: 'Thermal safety throttling is active. System may perform an emergency shutdown if temperature exceeds safe thresholds.',
          message: `CPU core temperature reached ${cpu.temperatureC}°C. Active thermal throttling engaged.`,
          precautions: [
            'Elevate laptop base or move to a cooler environment to restore airflow.',
            'Verify cooling fans are functioning and clean any dust buildup from vents.',
            'Save open work to prevent data loss in the event of thermal shutdown.'
          ],
          actionLabel: 'Open Troubleshoot',
          actionTab: 'troubleshoot',
          actionComponent: 'cpu'
        });
      } else if (cpu.temperatureC >= 82) {
        if (overallHealthStatus !== 'CRITICAL') overallHealthStatus = 'WARNING';
        overallHealthScore -= 15;
        alerts.push({
          type: 'CPU_TEMP_WARNING',
          component: 'cpu',
          severity: 'WARNING',
          title: `Elevated CPU Temperature (${cpu.temperatureC}°C)`,
          metric: `${cpu.temperatureC}°C Core Temperature`,
          risk: 'Elevated core temperature reduces maximum boost clocks and increases fan noise.',
          message: `Processor temperature is elevated at ${cpu.temperatureC}°C.`,
          precautions: [
            'Ensure air vents have clearance from obstructions.',
            'Avoid operating the laptop on blankets, beds, or soft fabrics.'
          ],
          actionLabel: 'Open Troubleshoot',
          actionTab: 'troubleshoot',
          actionComponent: 'cpu'
        });
      }
    }

    // ============================================
    // 3. MEMORY EXHAUSTION / PRESSURE EVALUATION
    // ============================================
    if (memory && typeof memory.usedPercent === 'number') {
      if (memory.usedPercent >= 90) {
        if (overallHealthStatus !== 'CRITICAL') overallHealthStatus = 'CRITICAL';
        overallHealthScore -= 25;
        alerts.push({
          type: 'MEMORY_USAGE_CRITICAL',
          component: 'memory',
          severity: 'CRITICAL',
          title: `Critical Memory Utilization (${memory.usedPercent}%)`,
          metric: `${memory.usedPercent}% RAM (${memory.usedGB} / ${memory.totalGB} GB used)`,
          risk: 'Severe memory pressure causes disk paging (thrashing) and risk of application crashes.',
          message: `RAM usage reached ${memory.usedPercent}% (${memory.usedGB} GB of ${memory.totalGB} GB used, ${memory.freeGB} GB available).`,
          precautions: [
            'Close heavy browser tabs, virtualization tools, or large applications.',
            'Save all open work to prevent out-of-memory errors.',
            'Restart the system if memory is not released by background processes.'
          ],
          actionLabel: 'Open Troubleshoot',
          actionTab: 'troubleshoot',
          actionComponent: 'memory'
        });
      } else if (memory.usedPercent >= 78) {
        if (overallHealthStatus === 'HEALTHY') overallHealthStatus = 'WARNING';
        overallHealthScore -= 10;
        alerts.push({
          type: 'MEMORY_USAGE_WARNING',
          component: 'memory',
          severity: 'WARNING',
          title: `High Memory Utilization (${memory.usedPercent}%)`,
          metric: `${memory.usedPercent}% RAM (${memory.usedGB} / ${memory.totalGB} GB used)`,
          risk: 'High RAM usage reduces multitasking headroom and can slow down application switching.',
          message: `RAM usage is at ${memory.usedPercent}% (${memory.usedGB} GB of ${memory.totalGB} GB used, ${memory.freeGB} GB available).`,
          precautions: [
            'Close unused background applications and idle browser tabs.',
            'Check Task Manager for background processes consuming memory.'
          ],
          actionLabel: 'Open Troubleshoot',
          actionTab: 'troubleshoot',
          actionComponent: 'memory'
        });
      }
    }

    // ============================================
    // 4. STORAGE SPACE & SMART DRIVE EVALUATION
    // ============================================
    if (storage) {
      if (storage.smartStatus === 'FAILING_NOW') {
        overallHealthStatus = 'CRITICAL';
        overallHealthScore -= 50;
        alerts.push({
          type: 'SMART_FAILURE',
          component: 'storage',
          severity: 'CRITICAL',
          title: 'Hard Drive SMART Failure Warning',
          metric: `SMART Status: FAILING_NOW (${storage.mount || 'C:'})`,
          risk: 'Primary drive hardware has reported critical predictive failure flags. Total drive failure and permanent data loss may occur.',
          message: `Primary drive ${storage.mount || 'C:'} (${storage.model || 'Disk'}) is reporting imminent failure.`,
          precautions: [
            'Back up all personal files and documents to external media or cloud storage immediately.',
            'Submit an Avantis Technical Support ticket for priority drive replacement.'
          ],
          actionLabel: 'Open Troubleshoot',
          actionTab: 'troubleshoot',
          actionComponent: 'storage'
        });
      } else if (storage.reallocatedSectors > 0) {
        if (overallHealthStatus !== 'CRITICAL') overallHealthStatus = 'WARNING';
        overallHealthScore -= 20;
        alerts.push({
          type: 'SMART_REALLOCATED_SECTORS',
          component: 'storage',
          severity: 'WARNING',
          title: `Storage Reallocated Sectors (${storage.reallocatedSectors})`,
          metric: `${storage.reallocatedSectors} Reallocated Sectors`,
          risk: 'The storage controller has remapped damaged sectors. If this count increases over time, the drive is degrading.',
          message: `Primary drive has ${storage.reallocatedSectors} reallocated sectors.`,
          precautions: [
            'Maintain regular external backups of critical data.',
            'Monitor reallocated sector counts across regular diagnostic scans.'
          ],
          actionLabel: 'Open Troubleshoot',
          actionTab: 'troubleshoot',
          actionComponent: 'storage'
        });
      }

      // Free Space Thresholds
      if (storage.freePercent !== null) {
        if (storage.freePercent < 5 || (storage.freeGB !== null && storage.freeGB < 10)) {
          if (overallHealthStatus !== 'CRITICAL') overallHealthStatus = 'CRITICAL';
          overallHealthScore -= 30;
          alerts.push({
            type: 'LOW_STORAGE_CRITICAL',
            component: 'storage',
            severity: 'CRITICAL',
            title: `Low Disk Space (Drive ${storage.mount || 'C:'})`,
            metric: `Only ${storage.freeGB} GB (${storage.freePercent}%) remaining on ${storage.mount || 'C:'}`,
            risk: 'Windows system updates cannot install and applications will fail to save data.',
            message: `Primary drive ${storage.mount || 'C:'} has only ${storage.freeGB} GB (${storage.freePercent}%) free space remaining.`,
            precautions: [
              'Run System Cleanup to remove temporary cache files and system crash dumps.',
              'Empty the Windows Recycle Bin and clean the Downloads folder.',
              'Uninstall large unused applications in Windows Settings.'
            ],
            actionLabel: 'Clean Up Files',
            actionTab: 'cleanup',
            actionComponent: 'storage'
          });
        } else if (storage.freePercent < 15 || (storage.freeGB !== null && storage.freeGB < 25)) {
          if (overallHealthStatus === 'HEALTHY') overallHealthStatus = 'WARNING';
          overallHealthScore -= 15;
          alerts.push({
            type: 'LOW_STORAGE_WARNING',
            component: 'storage',
            severity: 'WARNING',
            title: `Low Disk Space (Drive ${storage.mount || 'C:'})`,
            metric: `${storage.freeGB} GB (${storage.freePercent}%) free space`,
            risk: 'Low free space can reduce SSD write performance and shorten drive lifespan.',
            message: `Primary drive ${storage.mount || 'C:'} free space is low (${storage.freeGB} GB free).`,
            precautions: [
              'Run System Cleanup to reclaim temporary and cache files.',
              'Move large archived files or installer packages to external media.'
            ],
            actionLabel: 'Clean Up Files',
            actionTab: 'cleanup',
            actionComponent: 'storage'
          });
        }
      }
    }

    // ============================================
    // 5. BATTERY & POWER EVALUATION
    // ============================================
    if (battery && battery.hasBattery) {
      if (!battery.isAcConnected && typeof battery.currentPercent === 'number') {
        if (battery.currentPercent <= 8) {
          overallHealthStatus = 'CRITICAL';
          overallHealthScore -= 30;
          alerts.push({
            type: 'BATTERY_CHARGE_CRITICAL',
            component: 'battery',
            severity: 'CRITICAL',
            title: `Critically Low Battery (${battery.currentPercent}%)`,
            metric: `${battery.currentPercent}% Remaining (On Battery)`,
            risk: 'Emergency shutdown is imminent. Unsaved work will be lost.',
            message: `Battery level is at ${battery.currentPercent}% and discharging.`,
            precautions: [
              'Connect the AC power adapter immediately to prevent shutdown.',
              'Save all open documents and files immediately.'
            ],
            actionLabel: 'Open Troubleshoot',
            actionTab: 'troubleshoot',
            actionComponent: 'power'
          });
        } else if (battery.currentPercent <= 15) {
          if (overallHealthStatus === 'HEALTHY') overallHealthStatus = 'WARNING';
          overallHealthScore -= 10;
          alerts.push({
            type: 'BATTERY_CHARGE_WARNING',
            component: 'battery',
            severity: 'WARNING',
            title: `Low Battery Warning (${battery.currentPercent}%)`,
            metric: `${battery.currentPercent}% Battery Remaining`,
            risk: 'Limited battery runtime remaining.',
            message: `Battery has discharged to ${battery.currentPercent}%.`,
            precautions: [
              'Connect AC charger soon or enable Windows Battery Saver.',
              'Close heavy applications to prolong runtime.'
            ],
            actionLabel: 'Open Troubleshoot',
            actionTab: 'troubleshoot',
            actionComponent: 'power'
          });
        }
      }

      if (battery.healthPercent !== null) {
        if (battery.healthPercent < 60) {
          if (overallHealthStatus !== 'CRITICAL') overallHealthStatus = 'CRITICAL';
          overallHealthScore -= 25;
          alerts.push({
            type: 'BATTERY_WEAR_CRITICAL',
            component: 'battery',
            severity: 'CRITICAL',
            title: `Battery Capacity Degradation (${battery.healthPercent}%)`,
            metric: `${battery.healthPercent}% Full Charge Capacity remaining`,
            risk: 'Battery holds less than 60% of original design capacity.',
            message: `Battery health degraded to ${battery.healthPercent}% of design capacity.`,
            precautions: [
              'Contact Avantis Support to order a genuine battery replacement.',
              'Avoid relying on battery power for heavy workloads.'
            ],
            actionLabel: 'Open Troubleshoot',
            actionTab: 'troubleshoot',
            actionComponent: 'power'
          });
        } else if (battery.healthPercent < 80) {
          if (overallHealthStatus === 'HEALTHY') overallHealthStatus = 'WARNING';
          overallHealthScore -= 10;
          alerts.push({
            type: 'BATTERY_WEAR_WARNING',
            component: 'battery',
            severity: 'WARNING',
            title: `Battery Capacity Wear (${battery.healthPercent}%)`,
            metric: `${battery.healthPercent}% Battery Health`,
            risk: 'Battery capacity is showing noticeable wear.',
            message: `Battery health is at ${battery.healthPercent}% of original design capacity.`,
            precautions: [
              'Perform a full battery calibration cycle (charge to 100%, discharge to 5%, recharge to 100%).'
            ],
            actionLabel: 'Open Troubleshoot',
            actionTab: 'troubleshoot',
            actionComponent: 'power'
          });
        }
      }
    }

    return {
      status: overallHealthStatus,
      score: Math.max(0, overallHealthScore),
      alertCount: alerts.length,
      alerts
    };
  }
}

module.exports = ThresholdEngine;
