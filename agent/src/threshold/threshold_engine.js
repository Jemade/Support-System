class ThresholdEngine {
  evaluate(diagnostics) {
    const alerts = [];
    let overallHealthStatus = 'HEALTHY'; // HEALTHY, WARNING, CRITICAL
    let overallHealthScore = 100;

    const { cpu, memory, storage, battery } = diagnostics;

    // 1. SMART / Storage Evaluation
    if (storage.smartStatus === 'FAILING_NOW') {
      overallHealthStatus = 'CRITICAL';
      overallHealthScore -= 50;
      alerts.push({
        type: 'SMART_FAILURE',
        severity: 'CRITICAL',
        title: 'Hard Drive SMART Failure Detected',
        message: 'Drive reporting imminent SMART hardware failure. Immediate disk backup and drive replacement recommended.'
      });
    } else if (storage.reallocatedSectors > 0) {
      if (overallHealthStatus !== 'CRITICAL') overallHealthStatus = 'WARNING';
      overallHealthScore -= 20;
      alerts.push({
        type: 'SMART_REALLOCATED_SECTORS',
        severity: 'WARNING',
        title: 'Storage Reallocated Sectors Detected',
        message: `Drive has ${storage.reallocatedSectors} reallocated sectors. Drive health monitoring active.`
      });
    }

    if (storage.freePercent < 5) {
      overallHealthStatus = 'CRITICAL';
      overallHealthScore -= 30;
      alerts.push({
        type: 'LOW_STORAGE_CRITICAL',
        severity: 'CRITICAL',
        title: 'Critically Low Storage Space',
        message: `Primary drive C: has only ${storage.freePercent}% (${storage.freeGB} GB) free space remaining.`
      });
    } else if (storage.freePercent < 15) {
      if (overallHealthStatus !== 'CRITICAL') overallHealthStatus = 'WARNING';
      overallHealthScore -= 15;
      alerts.push({
        type: 'LOW_STORAGE_WARNING',
        severity: 'WARNING',
        title: 'Low Storage Space Warning',
        message: `Primary drive C: has ${storage.freePercent}% (${storage.freeGB} GB) free space remaining.`
      });
    }

    // 2. Battery Health Evaluation (if battery present)
    if (battery && battery.hasBattery) {
      if (battery.healthPercent < 60) {
        overallHealthStatus = 'CRITICAL';
        overallHealthScore -= 25;
        alerts.push({
          type: 'BATTERY_WEAR_CRITICAL',
          severity: 'CRITICAL',
          title: 'Critical Battery Capacity Degradation',
          message: `Battery health degraded to ${battery.healthPercent}% of design capacity. Battery replacement recommended.`
        });
      } else if (battery.healthPercent < 80) {
        if (overallHealthStatus !== 'CRITICAL') overallHealthStatus = 'WARNING';
        overallHealthScore -= 10;
        alerts.push({
          type: 'BATTERY_WEAR_WARNING',
          severity: 'WARNING',
          title: 'Battery Capacity Warning',
          message: `Battery health is at ${battery.healthPercent}% of original design capacity.`
        });
      }
    }

    // 3. CPU Temperature Evaluation
    if (cpu.temperatureC >= 95) {
      overallHealthStatus = 'CRITICAL';
      overallHealthScore -= 35;
      alerts.push({
        type: 'CPU_TEMP_CRITICAL',
        severity: 'CRITICAL',
        title: 'Critical CPU Overheating',
        message: `CPU core temperature reached ${cpu.temperatureC}°C. Thermal throttling enabled.`
      });
    } else if (cpu.temperatureC >= 85) {
      if (overallHealthStatus !== 'CRITICAL') overallHealthStatus = 'WARNING';
      overallHealthScore -= 15;
      alerts.push({
        type: 'CPU_TEMP_WARNING',
        severity: 'WARNING',
        title: 'High CPU Temperature',
        message: `CPU temperature is high (${cpu.temperatureC}°C). Check system ventilation.`
      });
    }

    // 4. Memory Usage Evaluation
    if (memory.usedPercent >= 95) {
      if (overallHealthStatus !== 'CRITICAL') overallHealthStatus = 'WARNING';
      overallHealthScore -= 15;
      alerts.push({
        type: 'MEMORY_USAGE_HIGH',
        severity: 'WARNING',
        title: 'Critical RAM Consumption',
        message: `RAM usage is at ${memory.usedPercent}%. System performance may degrade.`
      });
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
