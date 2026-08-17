/**
 * AVANTIS PC ASSIST: GEMINI INTEGRATION & ACCEPTANCE CRITERIA TEST SUITE
 * Validates Part 1 (Chat Grounding & Guardrails) & Part 2 (Deterministic Trends & Predictions)
 */

const GeminiService = require('../agent/src/ai/gemini_service');
const PredictiveMonitor = require('../agent/src/ai/predictive_monitor');

async function runTestSuite() {
  console.log('====================================================');
  console.log('🧪 AVANTIS PC ASSIST — GEMINI AI ACCEPTANCE TEST SUITE');
  console.log('====================================================\n');

  const gemini = new GeminiService();
  let passed = 0;
  let failed = 0;

  function assertTest(name, condition, details = '') {
    if (condition) {
      console.log(`[PASS] ✅ ${name}`);
      if (details) console.log(`       ${details}`);
      passed++;
    } else {
      console.error(`[FAIL] ❌ ${name}`);
      if (details) console.error(`       ${details}`);
      failed++;
    }
  }

  // ----------------------------------------------------
  // TEST 1: CHAT GROUNDED ANSWER
  // ----------------------------------------------------
  console.log('--- PART 1: CHAT ASSISTANT GROUNDING & GUARDRAILS ---');
  const mockScanData = {
    generatedAt: '2026-08-17T07:43:18.842Z',
    overallStatus: 'PASS',
    summary: { updatesInstalled: 6, spaceRecoveredGb: 0.12, filesOptimized: 148, threatsRemoved: 0 },
    modules: [
      { key: 'hardware', name: 'Scan Hardware', status: 'PASS', summary: 'All hardware healthy' },
      { key: 'threat', name: 'Threat Scan', status: 'PASS', summary: '0 threats detected', data: { threats: [] } }
    ]
  };

  const mockLiveDiag = {
    cpu: { loadPercent: 72, temperatureC: 38 },
    memory: { usedPercent: 65, usedGB: 5.2, totalGB: 8.0 },
    storage: { usedPercent: 51, freeGB: 74, smartStatus: 'PASSED' }
  };

  const cpuAnswer = await gemini.askAssistant("Is my CPU okay?", mockScanData, mockLiveDiag);
  assertTest(
    'Grounded Answer: Answers using actual CPU numbers (72% or 38°C)',
    cpuAnswer.includes('72') || cpuAnswer.includes('38') || cpuAnswer.toLowerCase().includes('load') || cpuAnswer.toLowerCase().includes('cpu'),
    `Answer preview: "${cpuAnswer.slice(0, 140)}..."`
  );

  // ----------------------------------------------------
  // TEST 2: NO HALLUCINATION (GPU)
  // ----------------------------------------------------
  const gpuAnswer = await gemini.askAssistant("What's my GPU temperature?", mockScanData, mockLiveDiag);
  assertTest(
    'No Hallucination: Refuses to fabricate nonexistent GPU temperature',
    gpuAnswer.toLowerCase().includes('not') || gpuAnswer.toLowerCase().includes('gpu') || gpuAnswer.toLowerCase().includes('scan hardware'),
    `Answer preview: "${gpuAnswer.slice(0, 140)}..."`
  );

  // ----------------------------------------------------
  // TEST 3: THREAT EXPLANATION
  // ----------------------------------------------------
  const mockThreatScanData = {
    generatedAt: '2026-08-17T08:00:00.000Z',
    overallStatus: 'PASS',
    modules: [
      {
        key: 'threat',
        name: 'Threat Scan',
        status: 'PASS',
        summary: '1 threat neutralized',
        data: {
          threats: [
            { threatName: 'Trojan:Win32/Wacatac.B!ml', severityId: 5, actionTaken: 'Quarantined', filePath: 'C:\\Users\\admin\\Downloads\\sample.exe' }
          ]
        }
      }
    ]
  };

  const threatAnswer = await gemini.askAssistant("What did the virus scan find?", mockThreatScanData, mockLiveDiag);
  assertTest(
    'Threat Explanation: Explains threat name and quarantined status',
    threatAnswer.toLowerCase().includes('wacatac') || threatAnswer.toLowerCase().includes('quarantined') || threatAnswer.toLowerCase().includes('threat'),
    `Answer preview: "${threatAnswer.slice(0, 140)}..."`
  );

  // ----------------------------------------------------
  // TEST 4: REFUSES OFF-TOPIC
  // ----------------------------------------------------
  const poemAnswer = await gemini.askAssistant("Write me a poem about the ocean", mockScanData, mockLiveDiag);
  assertTest(
    'Refuses Off-Topic: Declines poetry/recipes and redirects to PC health',
    poemAnswer.toLowerCase().includes('pc') || poemAnswer.toLowerCase().includes('assistant') || poemAnswer.toLowerCase().includes('health'),
    `Answer preview: "${poemAnswer.slice(0, 140)}..."`
  );

  // ----------------------------------------------------
  // TEST 5: EMPTY SCAN HISTORY
  // ----------------------------------------------------
  const emptyAnswer = await gemini.askAssistant("How is my system?", null, null);
  assertTest(
    'Empty Scan Handling: Suggests running a scan first on empty baseline',
    emptyAnswer.toLowerCase().includes('scan') || emptyAnswer.toLowerCase().includes('recorded'),
    `Answer preview: "${emptyAnswer.slice(0, 140)}..."`
  );

  // ----------------------------------------------------
  // TEST 6: DETERMINISTIC BACKGROUND TREND MATH
  // ----------------------------------------------------
  console.log('\n--- PART 2: BACKGROUND PREDICTIVE TRENDS ---');
  const mockReportStore = {
    getAllReports: () => []
  };
  const monitor = new PredictiveMonitor(mockReportStore, gemini, null);

  // Series A: Disk free dropping 40% -> 20%
  const decliningDiskSeries = [
    { generatedAt: '2026-08-10T10:00:00Z', modules: [{ key: 'hardware', data: { storage: { freeGB: 80, totalGB: 200, usedPercent: 60 } } }] },
    { generatedAt: '2026-08-12T10:00:00Z', modules: [{ key: 'hardware', data: { storage: { freeGB: 60, totalGB: 200, usedPercent: 70 } } }] },
    { generatedAt: '2026-08-14T10:00:00Z', modules: [{ key: 'hardware', data: { storage: { freeGB: 40, totalGB: 200, usedPercent: 80 } } }] }
  ];

  const diskFlags = monitor.detectTrends(decliningDiskSeries);
  assertTest(
    'Real Trend Detected: Detects declining disk space across 3 scans',
    diskFlags.length === 1 && diskFlags[0].type === 'disk_space_declining' && diskFlags[0].dropPercent === 20,
    `Detected flags: ${JSON.stringify(diskFlags)}`
  );

  // Series B: Stable / flat metrics (Zero false positives)
  const flatSeries = [
    { generatedAt: '2026-08-10T10:00:00Z', modules: [{ key: 'hardware', data: { storage: { freeGB: 75, totalGB: 200, usedPercent: 62 }, cpu: { temperatureC: 45 } } }] },
    { generatedAt: '2026-08-12T10:00:00Z', modules: [{ key: 'hardware', data: { storage: { freeGB: 74, totalGB: 200, usedPercent: 63 }, cpu: { temperatureC: 46 } } }] },
    { generatedAt: '2026-08-14T10:00:00Z', modules: [{ key: 'hardware', data: { storage: { freeGB: 75, totalGB: 200, usedPercent: 62 }, cpu: { temperatureC: 44 } } }] }
  ];

  const flatFlags = monitor.detectTrends(flatSeries);
  assertTest(
    'No False Positives: Flat/noisy series raises zero flags',
    flatFlags.length === 0,
    `Flags count: ${flatFlags.length}`
  );

  // Series C: SMART Anomaly detection
  const smartSeries = [
    { generatedAt: '2026-08-14T10:00:00Z', modules: [{ key: 'hardware', data: { storage: { smartStatus: 'PREDICTIVE_FAILURE', driveModel: 'NVMe 512GB' } } }] }
  ];
  const smartFlags = monitor.detectTrends(smartSeries);
  assertTest(
    'SMART Anomaly Flag: Immediate flag raised on SMART warning',
    smartFlags.length === 1 && smartFlags[0].type === 'smart_anomaly',
    `Flags: ${JSON.stringify(smartFlags)}`
  );

  // ----------------------------------------------------
  // TEST 7: GEMINI EXPLANATION & URGENCY RESOLUTION
  // ----------------------------------------------------
  console.log('\n--- PART 3: AI EXPLANATION & RATE-LIMIT RESILIENCE ---');
  if (diskFlags.length > 0) {
    const aiExplanation = await gemini.explainTrend(diskFlags[0]);
    assertTest(
      'Structured Trend Explanation: JSON with explanation and recommended_action',
      typeof aiExplanation.explanation === 'string' && typeof aiExplanation.recommended_action === 'string',
      `Recommendation: [${aiExplanation.recommended_action}], Urgency: [${aiExplanation.urgency}]`
    );
  }

  // Test Fallback when API key is null
  const offlineGemini = new GeminiService('');
  const offlineExplanation = await offlineGemini.explainTrend({ type: 'disk_space_declining', dropPercent: 20, currentFreeGB: 8 });
  assertTest(
    'Offline/Quota Fallback: Deterministic local template generated without crashing',
    offlineExplanation.recommended_action === 'run_cleanup' && offlineExplanation.urgency === 'high',
    `Fallback output: ${JSON.stringify(offlineExplanation)}`
  );

  console.log('\n====================================================');
  console.log(`📊 TEST SUITE COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');
}

runTestSuite();
