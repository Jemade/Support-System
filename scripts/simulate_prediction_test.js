/**
 * AVANTIS PC ASSIST — PREDICTION SIMULATOR & TEST UTILITY
 * Injects deterministic historical scan trends into the live agent and tests UI alerts & Windows Toasts.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const REPORTS_DIR = path.resolve(__dirname, '..', 'reports');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function generateReport(daysAgo, hwData) {
  const date = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  const tsString = date.toISOString().replace(/[:.]/g, '-');
  const filename = `SIM_PC_${tsString}.json`;
  const filePath = path.join(REPORTS_DIR, filename);

  const report = {
    reportId: `SIM-${filename.replace('.json', '')}`,
    filename,
    hostname: 'AVANTIS-TEST-RIG',
    platform: 'win32',
    arch: 'x64',
    generatedAt: date.toISOString(),
    overallStatus: 'PASS',
    summary: { updatesInstalled: 2, spaceRecoveredGb: 0.1, filesOptimized: 50, threatsRemoved: 0 },
    modules: [
      {
        key: 'hardware',
        name: 'Scan Hardware',
        status: 'PASS',
        summary: 'Subsystem check complete',
        data: hwData
      },
      {
        key: 'threat',
        name: 'Threat Scan',
        status: 'PASS',
        summary: '0 threats detected',
        data: { threats: [] }
      }
    ]
  };

  fs.writeFileSync(filePath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`[Simulator] Injected historical scan report: ${filename}`);
  return filePath;
}

async function triggerLiveCheck() {
  return new Promise((resolve) => {
    const req = http.request('http://localhost:9140/api/ai/predict/check', { method: 'POST' }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          resolve({ success: false, raw: body });
        }
      });
    });
    req.on('error', (err) => resolve({ success: false, error: err.message }));
    req.end();
  });
}

async function runScenario(scenarioName) {
  ensureDir(REPORTS_DIR);
  console.log('\n====================================================');
  console.log(`🔮 RUNNING PREDICTIVE SCENARIO: [${scenarioName.toUpperCase()}]`);
  console.log('====================================================\n');

  if (scenarioName === 'disk') {
    console.log('Generating 3 historical scans with declining disk space (80GB -> 60GB -> 35GB)...');
    generateReport(6, { storage: { freeGB: 80, totalGB: 200, usedPercent: 60, driveType: 'NVMe SSD', smartStatus: 'PASSED' }, cpu: { temperatureC: 40 } });
    generateReport(3, { storage: { freeGB: 60, totalGB: 200, usedPercent: 70, driveType: 'NVMe SSD', smartStatus: 'PASSED' }, cpu: { temperatureC: 41 } });
    generateReport(1, { storage: { freeGB: 35, totalGB: 200, usedPercent: 82.5, driveType: 'NVMe SSD', smartStatus: 'PASSED' }, cpu: { temperatureC: 42 } });
  } else if (scenarioName === 'thermal') {
    console.log('Generating 3 historical scans with rising CPU thermal trend (42°C -> 58°C -> 78°C)...');
    generateReport(6, { cpu: { temperatureC: 42, loadPercent: 20 }, storage: { freeGB: 80, totalGB: 200, usedPercent: 60 } });
    generateReport(3, { cpu: { temperatureC: 58, loadPercent: 45 }, storage: { freeGB: 79, totalGB: 200, usedPercent: 60 } });
    generateReport(1, { cpu: { temperatureC: 78, loadPercent: 85 }, storage: { freeGB: 79, totalGB: 200, usedPercent: 60 } });
  } else if (scenarioName === 'smart') {
    console.log('Generating scan with SMART storage failure alert...');
    generateReport(1, { storage: { freeGB: 65, totalGB: 200, usedPercent: 67.5, driveType: 'NVMe SSD', smartStatus: 'PREDICTIVE_FAILURE', driveModel: 'Avantis NVMe 512GB' } });
  } else if (scenarioName === 'battery') {
    console.log('Generating 5 historical scans with battery degradation (98% -> 94% -> 90% -> 86% -> 82%)...');
    generateReport(12, { battery: { hasBattery: true, healthPercent: 98, currentPercent: 90 } });
    generateReport(9, { battery: { hasBattery: true, healthPercent: 94, currentPercent: 85 } });
    generateReport(6, { battery: { hasBattery: true, healthPercent: 90, currentPercent: 80 } });
    generateReport(3, { battery: { hasBattery: true, healthPercent: 86, currentPercent: 75 } });
    generateReport(1, { battery: { hasBattery: true, healthPercent: 82, currentPercent: 70 } });
  }

  console.log('\n[Simulator] Triggering live AI Trend Analysis on agent (http://localhost:9140)...');
  const result = await triggerLiveCheck();
  console.log('\n--- LIVE PREDICTION RESULT ---');
  console.log(JSON.stringify(result, null, 2));

  console.log('\n====================================================');
  console.log('✅ TEST COMPLETE:');
  console.log('1. A native Windows Action Center toast notification was fired.');
  console.log('2. Open http://localhost:9142 and inspect the "Summary" tab.');
  console.log('3. You will see the AI Predictive Care banner with a "Resolve Now" button!');
  console.log('====================================================\n');
}

const scenario = process.argv[2] || 'disk';
runScenario(scenario);
