const express = require('express');
const router = express.Router();
const db = require('../database/db');

// Telemetry Ingest Endpoint
router.post('/telemetry/ingest', async (req, res) => {
  try {
    const data = req.body;
    if (!data.deviceId) {
      return res.status(400).json({ success: false, message: 'Missing deviceId in telemetry payload' });
    }

    const timestamp = data.timestamp || new Date().toISOString();

    // 1. Register/Update Device
    await db.upsertDevice({
      deviceId: data.deviceId,
      hostname: data.hostname || 'AVANTIS-PC',
      model: data.model || 'Avantis All-In-One PC',
      serialNumber: data.serialNumber || data.deviceId,
      osVersion: data.osVersion || 'Windows 11 Enterprise',
      healthStatus: data.healthStatus || 'HEALTHY',
      healthScore: data.healthScore !== undefined ? data.healthScore : 100,
      diagnostics: data.diagnostics || {},
      timestamp
    });

    // 2. Record Telemetry Metrics History
    await db.recordTelemetry({
      deviceId: data.deviceId,
      cpuLoad: data.cpuLoad || 0,
      cpuTemp: data.cpuTemp || 45,
      ramUsedPercent: data.ramUsedPercent || 30,
      storageFreePercent: data.storageFreePercent || 65,
      storageSmartStatus: data.storageSmartStatus || 'PASSED',
      batteryHealthPercent: data.batteryHealthPercent || 100,
      diagnostics: data.diagnostics || {},
      timestamp
    });

    // 3. Record Alerts if present
    if (data.alerts && data.alerts.length > 0) {
      await db.recordAlerts(data.deviceId, data.alerts, timestamp);
    }

    res.json({ success: true, message: 'Telemetry successfully ingested into PostgreSQL' });
  } catch (err) {
    console.error('[Backend API] Telemetry Ingest Error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Devices endpoints
router.get('/devices', async (req, res) => {
  try {
    const devices = await db.getDevices();
    res.json({ success: true, count: devices.length, devices });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/devices/:id', async (req, res) => {
  try {
    const device = await db.getDeviceById(req.params.id);
    if (!device) {
      return res.status(404).json({ success: false, message: 'Device not found' });
    }
    res.json({ success: true, device });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Active Alerts endpoint
router.get('/alerts', async (req, res) => {
  try {
    const alerts = await db.getActiveAlerts();
    res.json({ success: true, count: alerts.length, alerts });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Support Tickets endpoints
router.post('/tickets', async (req, res) => {
  try {
    const { deviceId, customerName, customerEmail, issueDescription, priority, diagnosticSnapshot } = req.body;

    const ticketId = 'AVT-TCK-' + Math.floor(100000 + Math.random() * 900000);
    const timestamp = new Date().toISOString();

    const ticket = {
      ticketId,
      deviceId: deviceId || 'AVT-UNKNOWN',
      customerName: customerName || 'Valued Customer',
      customerEmail: customerEmail || 'support@avantispc.com',
      issueDescription: issueDescription || 'General diagnostic escalation',
      priority: priority || 'MEDIUM',
      diagnosticSnapshot: diagnosticSnapshot || {},
      timestamp
    };

    await db.createTicket(ticket);

    res.json({
      success: true,
      message: 'Support ticket created successfully',
      ticket: {
        id: ticketId,
        status: 'OPEN',
        created_at: timestamp
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/tickets', async (req, res) => {
  try {
    const tickets = await db.getTickets();
    res.json({ success: true, count: tickets.length, tickets });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.patch('/tickets/:id', async (req, res) => {
  try {
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ success: false, message: 'Missing status field' });
    }
    await db.updateTicketStatus(req.params.id, status);
    res.json({ success: true, message: `Ticket ${req.params.id} status updated to ${status}` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
