/**
 * AVANTIS PC ASSIST: PREDICTIVE MONITORING ENGINE
 * Deterministic mathematical trend analysis + Gemini plain-English explanations.
 */

const crypto = require('crypto');

class PredictiveMonitor {
  constructor(reportStore, geminiService, notificationManager, options = {}) {
    this.reportStore = reportStore;
    this.geminiService = geminiService;
    this.notificationManager = notificationManager;
    this.checkIntervalMs = options.checkIntervalMs || (6 * 60 * 60 * 1000); // Every 6 hours
    this.activePredictions = [];
    this.notifiedHashes = new Set();
    this.timer = null;
  }

  start() {
    this.checkTrends();
    if (!this.timer) {
      this.timer = setInterval(() => this.checkTrends(), this.checkIntervalMs);
    }
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Deterministic mathematical trend detection across scan history
   * No AI guesswork in arithmetic.
   */
  detectTrends(scanHistory) {
    if (!Array.isArray(scanHistory) || scanHistory.length < 1) {
      return [];
    }

    // Sort oldest to newest
    const sorted = [...scanHistory].sort((a, b) => new Date(a.generatedAt) - new Date(b.generatedAt));
    const flags = [];

    // Helper: extract hardware module data if available
    const getHwData = (scan) => {
      const mod = (scan.modules || []).find(m => m.key === 'hardware');
      return mod ? mod.data : null;
    };

    // 1. DISK SPACE TREND (Drop of >= 15% across 3+ scans)
    const storageSeries = sorted.map(s => {
      const hw = getHwData(s);
      return hw?.storage ? { freeGB: hw.storage.freeGB, totalGB: hw.storage.totalGB, usedPct: hw.storage.usedPercent } : null;
    }).filter(Boolean);

    if (storageSeries.length >= 3) {
      const first = storageSeries[0];
      const latest = storageSeries[storageSeries.length - 1];
      const dropPct = latest.usedPct - first.usedPct; // Increase in usedPct is a drop in free space
      if (dropPct >= 15 || (first.freeGB - latest.freeGB >= 10)) {
        flags.push({
          type: 'disk_space_declining',
          dropPercent: Math.round(dropPct),
          initialFreeGB: first.freeGB,
          currentFreeGB: latest.freeGB,
          totalGB: latest.totalGB,
          samplesCount: storageSeries.length
        });
      }
    }

    // 2. CPU THERMAL TREND (Rise of >= 10°C across 3+ scans)
    const tempSeries = sorted.map(s => {
      const hw = getHwData(s);
      return hw?.cpu?.temperatureC !== undefined && hw.cpu.temperatureC !== null ? hw.cpu.temperatureC : null;
    }).filter(t => typeof t === 'number');

    if (tempSeries.length >= 3) {
      const firstTemp = tempSeries[0];
      const latestTemp = tempSeries[tempSeries.length - 1];
      const rise = latestTemp - firstTemp;
      if (rise >= 10 || latestTemp >= 85) {
        flags.push({
          type: 'cpu_temp_rising',
          riseC: Math.round(rise),
          initialTempC: firstTemp,
          currentTempC: latestTemp,
          samplesCount: tempSeries.length
        });
      }
    }

    // 3. BATTERY HEALTH DEGRADATION (Drop of >= 5% across 5+ scans)
    const batterySeries = sorted.map(s => {
      const hw = getHwData(s);
      return hw?.battery?.hasBattery ? hw.battery.healthPercent : null;
    }).filter(b => typeof b === 'number');

    if (batterySeries.length >= 5) {
      const firstHealth = batterySeries[0];
      const latestHealth = batterySeries[batterySeries.length - 1];
      const degradation = firstHealth - latestHealth;
      if (degradation >= 5) {
        flags.push({
          type: 'battery_degradation',
          dropPercent: Math.round(degradation),
          initialHealthPct: firstHealth,
          currentHealthPct: latestHealth,
          samplesCount: batterySeries.length
        });
      }
    }

    // 4. SMART HEALTH STATUS CHECK
    const latestScan = sorted[sorted.length - 1];
    const latestHw = getHwData(latestScan);
    if (latestHw?.storage?.smartStatus && latestHw.storage.smartStatus !== 'PASSED' && latestHw.storage.smartStatus !== 'OK') {
      flags.push({
        type: 'smart_anomaly',
        smartStatus: latestHw.storage.smartStatus,
        driveModel: latestHw.storage.driveModel || 'Primary NVMe/SSD'
      });
    }

    return flags;
  }

  /**
   * Evaluates trends, queries Gemini for explanations, and fires native notifications
   */
  async checkTrends() {
    try {
      const reports = this.reportStore.getAllReports();
      const rawFlags = this.detectTrends(reports);

      if (rawFlags.length === 0) {
        this.activePredictions = [];
        return;
      }

      const predictions = [];

      for (const flag of rawFlags) {
        const flagHash = crypto.createHash('md5').update(JSON.stringify(flag)).digest('hex');
        
        // Query Gemini (or cache/fallback)
        const explanationObj = await this.geminiService.explainTrend(flag);

        const prediction = {
          id: `PRED-${flagHash.slice(0, 8)}`,
          flagType: flag.type,
          flagData: flag,
          explanation: explanationObj.explanation,
          recommendedAction: explanationObj.recommended_action,
          urgency: explanationObj.urgency || 'medium',
          detectedAt: new Date().toISOString(),
          isResolved: false
        };

        predictions.push(prediction);

        // Fire native Windows OS popup toast notification if not already notified for this exact trend
        if (!this.notifiedHashes.has(flagHash)) {
          this.notifiedHashes.add(flagHash);
          if (this.notificationManager && typeof this.notificationManager.sendWindowsToast === 'function') {
            console.log(`[PredictiveMonitor] Firing Windows OS Toast Popup for [${prediction.flagType}]: ${prediction.explanation}`);
            this.notificationManager.sendWindowsToast({
              title: 'Avantis Predictive Care',
              message: prediction.explanation,
              launchUrl: 'http://localhost:9142'
            });
          }
        }
      }

      this.activePredictions = predictions;
    } catch (err) {
      console.warn('[PredictiveMonitor] Error checking trends:', err.message);
    }
  }

  getActivePredictions() {
    return this.activePredictions;
  }
}

module.exports = PredictiveMonitor;
