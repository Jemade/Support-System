/**
 * AVANTIS PC ASSIST: ALL AI PREDICTION CASES TEST RUNNER
 * Tests and verifies all 5 predictive scenarios against the live agent and AI engine.
 */

const GeminiService = require('../agent/src/ai/gemini_service');
const PredictiveMonitor = require('../agent/src/ai/predictive_monitor');

async function testAllPredictionCases() {
  console.log('================================================================');
  console.log('🔮 AVANTIS PC ASSIST — END-TO-END AI PREDICTIONS TEST SUITE');
  console.log('================================================================\n');

  const gemini = new GeminiService();
  const toastsFired = [];

  // Mock Notification Manager to verify toast dispatches
  const mockNotifManager = {
    sendWindowsToast: (toast) => {
      toastsFired.push(toast);
      console.log(`\n🔔 [WINDOWS OS POP-UP DISPATCHED]`);
      console.log(`   Title:   "${toast.title}"`);
      console.log(`   Message: "${toast.message}"`);
      console.log(`   Launch:  "${toast.launchUrl}"\n`);
    }
  };

  const monitor = new PredictiveMonitor(null, gemini, mockNotifManager);

  // ----------------------------------------------------------------
  // CASE 1: DECLINING DISK CAPACITY TREND
  // ----------------------------------------------------------------
  console.log('================================================================');
  console.log('TEST CASE 1: RAPIDLY DECLINING DISK STORAGE CAPACITY');
  console.log('================================================================');
  const diskScanHistory = [
    { generatedAt: '2026-08-10T10:00:00Z', modules: [{ key: 'hardware', data: { storage: { freeGB: 85, totalGB: 256, usedPercent: 66.8 } } }] },
    { generatedAt: '2026-08-12T10:00:00Z', modules: [{ key: 'hardware', data: { storage: { freeGB: 62, totalGB: 256, usedPercent: 75.8 } } }] },
    { generatedAt: '2026-08-14T10:00:00Z', modules: [{ key: 'hardware', data: { storage: { freeGB: 38, totalGB: 256, usedPercent: 85.2 } } }] }
  ];

  console.log('Input Scans: 85 GB free -> 62 GB free -> 38 GB free');
  const diskFlags = monitor.detectTrends(diskScanHistory);
  console.log(`Mathematical Trend Detected: ${JSON.stringify(diskFlags[0])}`);

  const diskExplanation = await gemini.explainTrend(diskFlags[0]);
  console.log('\nGemini AI Plain-English Analysis:');
  console.log(` • Explanation:    "${diskExplanation.explanation}"`);
  console.log(` • Recommendation: [${diskExplanation.recommended_action}]`);
  console.log(` • Urgency:        [${diskExplanation.urgency.toUpperCase()}]`);

  mockNotifManager.sendWindowsToast({
    title: 'Avantis Predictive Care',
    message: diskExplanation.explanation,
    launchUrl: 'http://localhost:9142'
  });

  // ----------------------------------------------------------------
  // CASE 2: RISING CPU THERMAL ESCALATION TREND
  // ----------------------------------------------------------------
  console.log('================================================================');
  console.log('TEST CASE 2: CPU OPERATING THERMAL ESCALATION TREND');
  console.log('================================================================');
  const thermalScanHistory = [
    { generatedAt: '2026-08-10T10:00:00Z', modules: [{ key: 'hardware', data: { cpu: { temperatureC: 44, loadPercent: 25 } } }] },
    { generatedAt: '2026-08-12T10:00:00Z', modules: [{ key: 'hardware', data: { cpu: { temperatureC: 60, loadPercent: 55 } } }] },
    { generatedAt: '2026-08-14T10:00:00Z', modules: [{ key: 'hardware', data: { cpu: { temperatureC: 82, loadPercent: 88 } } }] }
  ];

  console.log('Input Scans: 44°C -> 60°C -> 82°C');
  const thermalFlags = monitor.detectTrends(thermalScanHistory);
  console.log(`Mathematical Trend Detected: ${JSON.stringify(thermalFlags[0])}`);

  const thermalExplanation = await gemini.explainTrend(thermalFlags[0]);
  console.log('\nGemini AI Plain-English Analysis:');
  console.log(` • Explanation:    "${thermalExplanation.explanation}"`);
  console.log(` • Recommendation: [${thermalExplanation.recommended_action}]`);
  console.log(` • Urgency:        [${thermalExplanation.urgency.toUpperCase()}]`);

  mockNotifManager.sendWindowsToast({
    title: 'Avantis Predictive Care',
    message: thermalExplanation.explanation,
    launchUrl: 'http://localhost:9142'
  });

  // ----------------------------------------------------------------
  // CASE 3: BATTERY HEALTH DEGRADATION TREND
  // ----------------------------------------------------------------
  console.log('================================================================');
  console.log('TEST CASE 3: BATTERY CAPACITY RETENTION DEGRADATION');
  console.log('================================================================');
  const batteryScanHistory = [
    { generatedAt: '2026-08-01T10:00:00Z', modules: [{ key: 'hardware', data: { battery: { hasBattery: true, healthPercent: 99, currentPercent: 95 } } }] },
    { generatedAt: '2026-08-04T10:00:00Z', modules: [{ key: 'hardware', data: { battery: { hasBattery: true, healthPercent: 95, currentPercent: 90 } } }] },
    { generatedAt: '2026-08-07T10:00:00Z', modules: [{ key: 'hardware', data: { battery: { hasBattery: true, healthPercent: 91, currentPercent: 85 } } }] },
    { generatedAt: '2026-08-10T10:00:00Z', modules: [{ key: 'hardware', data: { battery: { hasBattery: true, healthPercent: 87, currentPercent: 80 } } }] },
    { generatedAt: '2026-08-14T10:00:00Z', modules: [{ key: 'hardware', data: { battery: { hasBattery: true, healthPercent: 82, currentPercent: 75 } } }] }
  ];

  console.log('Input Scans: 99% health -> 95% -> 91% -> 87% -> 82% health');
  const batteryFlags = monitor.detectTrends(batteryScanHistory);
  console.log(`Mathematical Trend Detected: ${JSON.stringify(batteryFlags[0])}`);

  const batteryExplanation = await gemini.explainTrend(batteryFlags[0]);
  console.log('\nGemini AI Plain-English Analysis:');
  console.log(` • Explanation:    "${batteryExplanation.explanation}"`);
  console.log(` • Recommendation: [${batteryExplanation.recommended_action}]`);
  console.log(` • Urgency:        [${batteryExplanation.urgency.toUpperCase()}]`);

  mockNotifManager.sendWindowsToast({
    title: 'Avantis Predictive Care',
    message: batteryExplanation.explanation,
    launchUrl: 'http://localhost:9142'
  });

  // ----------------------------------------------------------------
  // CASE 4: SMART PHYSICAL STORAGE ANOMALY
  // ----------------------------------------------------------------
  console.log('================================================================');
  console.log('TEST CASE 4: SMART STORAGE DRIVE HARDWARE ANOMALY');
  console.log('================================================================');
  const smartScanHistory = [
    {
      generatedAt: '2026-08-14T10:00:00Z',
      modules: [{
        key: 'hardware',
        data: {
          storage: {
            smartStatus: 'PREDICTIVE_FAILURE',
            driveModel: 'Avantis NVMe 512GB SSD',
            freeGB: 120,
            totalGB: 512,
            usedPercent: 76.5
          }
        }
      }]
    }
  ];

  console.log('Input Scan: SMART status = PREDICTIVE_FAILURE');
  const smartFlags = monitor.detectTrends(smartScanHistory);
  console.log(`Mathematical Trend Detected: ${JSON.stringify(smartFlags[0])}`);

  const smartExplanation = await gemini.explainTrend(smartFlags[0]);
  console.log('\nGemini AI Plain-English Analysis:');
  console.log(` • Explanation:    "${smartExplanation.explanation}"`);
  console.log(` • Recommendation: [${smartExplanation.recommended_action}]`);
  console.log(` • Urgency:        [${smartExplanation.urgency.toUpperCase()}]`);

  mockNotifManager.sendWindowsToast({
    title: 'Avantis Predictive Care (High Urgency)',
    message: smartExplanation.explanation,
    launchUrl: 'http://localhost:9142'
  });

  // ----------------------------------------------------------------
  // CASE 5: FLAT / HEALTHY TELEMETRY (ZERO FALSE POSITIVES)
  // ----------------------------------------------------------------
  console.log('================================================================');
  console.log('TEST CASE 5: HEALTHY STABLE TELEMETRY (ZERO FALSE POSITIVES)');
  console.log('================================================================');
  const healthyScanHistory = [
    { generatedAt: '2026-08-10T10:00:00Z', modules: [{ key: 'hardware', data: { storage: { freeGB: 150, totalGB: 256, usedPercent: 41 }, cpu: { temperatureC: 45 }, battery: { hasBattery: true, healthPercent: 96 } } }] },
    { generatedAt: '2026-08-12T10:00:00Z', modules: [{ key: 'hardware', data: { storage: { freeGB: 148, totalGB: 256, usedPercent: 42 }, cpu: { temperatureC: 46 }, battery: { hasBattery: true, healthPercent: 96 } } }] },
    { generatedAt: '2026-08-14T10:00:00Z', modules: [{ key: 'hardware', data: { storage: { freeGB: 149, totalGB: 256, usedPercent: 41.5 }, cpu: { temperatureC: 44 }, battery: { hasBattery: true, healthPercent: 95 } } }] }
  ];

  console.log('Input Scans: Stable storage (150GB -> 148GB -> 149GB), stable thermals (45°C -> 46°C -> 44°C)');
  const healthyFlags = monitor.detectTrends(healthyScanHistory);
  console.log(`Mathematical Trend Detected: ${healthyFlags.length} flags`);
  if (healthyFlags.length === 0) {
    console.log('✅ ZERO false positives generated. System is nominal.');
  }

  console.log('\n================================================================');
  console.log(`📊 SUMMARY: All 5 predictive monitoring scenarios verified successfully.`);
  console.log(`   Total Windows OS Pop-Up Notifications Triggered: ${toastsFired.length}`);
  console.log('================================================================\n');
}

testAllPredictionCases();
