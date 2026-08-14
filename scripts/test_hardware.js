const http = require('http');

function makeRequest(url, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const options = {
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', err => reject(err));

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runVerificationSuite() {
  console.log('\n=== Avantis PC Support System — Phase 1 Hardware Verification Suite ===\n');

  let passedTests = 0;
  let failedTests = 0;

  // Test 1: Verify Backend API Health & Database Status
  try {
    console.log('Test 1: Checking Backend API health & PostgreSQL connection...');
    const res = await makeRequest('http://localhost:9141/health');
    if (res.status === 200 && res.data.status === 'ONLINE') {
      console.log(`[PASS] Backend API Online — Database mode: ${res.data.database}`);
      passedTests++;
    } else {
      console.log('[FAIL] Backend API returned unexpected status:', res);
      failedTests++;
    }
  } catch (err) {
    console.log('[FAIL] Cannot connect to Backend API (http://localhost:9141):', err.message);
    failedTests++;
  }

  // Test 2: Verify Agent IPC Status Endpoint
  try {
    console.log('\nTest 2: Checking Local Agent IPC status & diagnostic collection...');
    const res = await makeRequest('http://localhost:9140/api/status');
    if (res.status === 200 && res.data.agentStatus === 'RUNNING') {
      const diag = res.data.diagnostics;
      console.log(`[PASS] Agent Service Running`);
      console.log(`       Hardware Serial: ${diag.system.serialNumber}`);
      console.log(`       Model:           ${diag.system.model}`);
      console.log(`       CPU Load/Temp:   ${diag.cpu.loadPercent}% / ${diag.cpu.temperatureC}°C`);
      console.log(`       RAM Usage:       ${diag.memory.usedPercent}% (${diag.memory.usedGB}/${diag.memory.totalGB} GB)`);
      console.log(`       Storage (C:):    ${diag.storage.usedPercent}% used, SMART: ${diag.storage.smartStatus}`);
      console.log(`       Power State:     ${diag.battery.statusMessage}`);
      passedTests++;
    } else {
      console.log('[FAIL] Agent IPC returned invalid response:', res);
      failedTests++;
    }
  } catch (err) {
    console.log('[FAIL] Cannot connect to Agent IPC (http://localhost:9140):', err.message);
    failedTests++;
  }

  // Test 3: Test System Cleanup Scan Endpoint
  try {
    console.log('\nTest 3: Testing System Cleanup Engine scan...');
    const res = await makeRequest('http://localhost:9140/api/cleanup/scan', 'POST');
    if (res.status === 200 && res.data.success) {
      console.log(`[PASS] Cleanup Scan successful — Found ${res.data.result.reclaimableMb} MB reclaimable across ${res.data.result.reclaimableFiles} temp files`);
      passedTests++;
    } else {
      console.log('[FAIL] Cleanup Scan failed:', res);
      failedTests++;
    }
  } catch (err) {
    console.log('[FAIL] Cleanup Scan error:', err.message);
    failedTests++;
  }

  // Test 4: Submit Test Support Ticket with Telemetry Snapshot
  let createdTicketId = null;
  try {
    console.log('\nTest 4: Testing Support Ticket Creation via Agent IPC...');
    const ticketPayload = {
      customerName: 'Tendai Moyo',
      customerEmail: 'tendai@company.co.zw',
      issueDescription: 'Avantis Hardware Diagnostic Escalation Test',
      priority: 'HIGH'
    };
    const res = await makeRequest('http://localhost:9140/api/support/ticket', 'POST', ticketPayload);
    if (res.status === 200 && res.data.success && res.data.ticket) {
      createdTicketId = res.data.ticket.id;
      console.log(`[PASS] Support Ticket Created Successfully — Ticket ID: ${createdTicketId}`);
      passedTests++;
    } else {
      console.log('[FAIL] Ticket creation failed:', res);
      failedTests++;
    }
  } catch (err) {
    console.log('[FAIL] Ticket creation error:', err.message);
    failedTests++;
  }

  // Test 5: Verify Device Registration in Backend Database
  try {
    console.log('\nTest 5: Verifying Device Registration in Backend Database...');
    const res = await makeRequest('http://localhost:9141/api/v1/devices');
    if (res.status === 200 && res.data.success && res.data.count > 0) {
      const dev = res.data.devices[0];
      console.log(`[PASS] Device Registered in DB — ID: ${dev.id}, Model: ${dev.model}, Health Score: ${dev.health_score}/100`);
      passedTests++;
    } else {
      console.log('[FAIL] Devices query returned no registered devices:', res);
      failedTests++;
    }
  } catch (err) {
    console.log('[FAIL] Devices query error:', err.message);
    failedTests++;
  }

  // Test 6: Verify Support Tickets reflected in Support Portal API
  try {
    console.log('\nTest 6: Verifying Ticket reflection in Support Portal API...');
    const res = await makeRequest('http://localhost:9141/api/v1/tickets');
    if (res.status === 200 && res.data.success && res.data.count > 0) {
      console.log(`[PASS] Total ${res.data.count} Support Ticket(s) found in PostgreSQL DB`);
      passedTests++;
    } else {
      console.log('[FAIL] Ticket list returned 0 tickets:', res);
      failedTests++;
    }
  } catch (err) {
    console.log('[FAIL] Ticket list error:', err.message);
    failedTests++;
  }

  // Test 7: Verify Notification Subsystem Status & Trigger
  try {
    console.log('\nTest 7: Verifying Notification Subsystem Status & Trigger...');
    const res = await makeRequest('http://localhost:9140/api/notifications/status');
    if (res.status === 200 && res.data.success && res.data.trackedSignals) {
      console.log(`[PASS] Notification Subsystem Online — Tracked signals: ${Object.keys(res.data.trackedSignals).join(', ')}`);
      passedTests++;
    } else {
      console.log('[FAIL] Notification subsystem returned invalid response:', res);
      failedTests++;
    }
  } catch (err) {
    console.log('[FAIL] Notification status check error:', err.message);
    failedTests++;
  }

  console.log('\n===============================================================');
  console.log(`Verification Summary: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('===============================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runVerificationSuite();
