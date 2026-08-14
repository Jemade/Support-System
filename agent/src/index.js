const express = require('express');
const cors = require('cors');
const HardwareCollector = require('./diagnostics/hardware_collector');
const ThresholdEngine = require('./threshold/threshold_engine');
const CleanupEngine = require('./cleanup/cleanup_engine');
const NotificationManager = require('./notifications/notification_manager');

const app = express();
app.use(cors());
app.use(express.json());

const collector = new HardwareCollector();
const thresholdEngine = new ThresholdEngine();
const cleanupEngine = new CleanupEngine();
const notificationManager = new NotificationManager();

const AGENT_PORT = 9140;
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:9141';

let latestDiagnostics = null;
let latestEvaluation = null;
let lastSyncTime = null;

async function refreshDiagnostics() {
  try {
    latestDiagnostics = await collector.collectFullDiagnostics();
    latestEvaluation = thresholdEngine.evaluate(latestDiagnostics);
    
    // Process native Windows notifications (fires on new warning/critical or escalation)
    notificationManager.processEvaluation(latestDiagnostics, latestEvaluation);

    // Automatically report to backend API
    await reportToBackend();
  } catch (err) {
    console.error('[Agent] Diagnostic refresh error:', err.message);
  }
}

async function reportToBackend() {
  if (!latestDiagnostics || !latestEvaluation) return;

  const payload = {
    deviceId: latestDiagnostics.system.serialNumber,
    hostname: latestDiagnostics.system.hostname,
    model: latestDiagnostics.system.model,
    serialNumber: latestDiagnostics.system.serialNumber,
    osVersion: latestDiagnostics.system.osVersion,
    healthStatus: latestEvaluation.status,
    healthScore: latestEvaluation.score,
    cpuLoad: latestDiagnostics.cpu.loadPercent,
    cpuTemp: latestDiagnostics.cpu.temperatureC,
    ramUsedPercent: latestDiagnostics.memory.usedPercent,
    storageFreePercent: latestDiagnostics.storage.freePercent,
    storageSmartStatus: latestDiagnostics.storage.smartStatus,
    batteryHealthPercent: latestDiagnostics.battery.healthPercent,
    alerts: latestEvaluation.alerts,
    diagnostics: latestDiagnostics,
    timestamp: new Date().toISOString()
  };

  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/telemetry/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      lastSyncTime = new Date().toISOString();
    }
  } catch (err) {
    // Cloud backend offline or unreachable — agent continues operating offline safely
  }
}

// IPC API Endpoints for Local Desktop UI Client
app.get('/api/status', async (req, res) => {
  if (!latestDiagnostics) {
    await refreshDiagnostics();
  }
  res.json({
    agentStatus: 'RUNNING',
    lastSyncTime,
    diagnostics: latestDiagnostics,
    evaluation: latestEvaluation
  });
});

app.post('/api/scan', async (req, res) => {
  await refreshDiagnostics();
  res.json({
    success: true,
    diagnostics: latestDiagnostics,
    evaluation: latestEvaluation
  });
});

app.post('/api/cleanup/scan', (req, res) => {
  const scanResult = cleanupEngine.scanSystem();
  res.json({ success: true, result: scanResult });
});

app.post('/api/cleanup/execute', (req, res) => {
  const cleanupResult = cleanupEngine.executeCleanup();
  // Refresh diagnostics after cleanup to reflect storage change
  refreshDiagnostics();
  res.json({ success: true, result: cleanupResult });
});

app.get('/api/notifications/status', (req, res) => {
  res.json({ success: true, ...notificationManager.getStatus() });
});

app.post('/api/notifications/test', (req, res) => {
  const { component = 'cpu', severity = 'WARNING' } = req.body || {};
  const mockAlerts = [{
    type: `${component.toUpperCase()}_TEST`,
    severity,
    title: `Avantis ${severity} Test Notification`,
    message: `This is a test notification for the ${component} component.`
  }];
  const summary = notificationManager.buildNotificationSummary(component, severity, mockAlerts, latestDiagnostics || {});
  notificationManager.sendWindowsToast(summary);
  res.json({ success: true, message: 'Test notification triggered', summary });
});

app.post('/api/support/ticket', async (req, res) => {
  try {
    const { customerName, customerEmail, issueDescription, priority } = req.body;
    
    // Ensure fresh diagnostics snapshot attached
    if (!latestDiagnostics) {
      await refreshDiagnostics();
    }

    const ticketPayload = {
      deviceId: latestDiagnostics.system.serialNumber,
      customerName: customerName || 'Valued Avantis Customer',
      customerEmail: customerEmail || 'customer@avantispc.com',
      issueDescription: issueDescription || 'General Support Escalation',
      priority: priority || 'MEDIUM',
      diagnosticSnapshot: {
        diagnostics: latestDiagnostics,
        evaluation: latestEvaluation
      }
    };

    const backendRes = await fetch(`${BACKEND_URL}/api/v1/tickets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ticketPayload)
    });

    if (backendRes.ok) {
      const data = await backendRes.json();
      return res.json({ success: true, ticket: data.ticket });
    } else {
      const errData = await backendRes.json().catch(() => ({}));
      return res.status(500).json({ success: false, message: errData.message || 'Failed to submit ticket to backend' });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Initialize & start background monitoring loop
async function startAgent() {
  app.listen(AGENT_PORT, () => {
    console.log(`[Avantis Agent] IPC API listening on http://localhost:${AGENT_PORT}`);
  });

  console.log('[Avantis Agent] Initializing background health monitoring service...');
  await refreshDiagnostics();

  // Polling loop every 30 seconds
  setInterval(refreshDiagnostics, 30000);
}

startAgent();
