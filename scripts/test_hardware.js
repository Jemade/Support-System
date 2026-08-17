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
  console.log('\n=== Avantis Hardware Support: Full System Verification Suite ===\n');

  let passedTests = 0;
  let failedTests = 0;

  // Test 1: Verify Backend API Health & Database Status
  try {
    console.log('Test 1: Checking Backend API health & database mode...');
    const res = await makeRequest('http://localhost:9141/health');
    if (res.status === 200 && res.data.status === 'ONLINE') {
      console.log(`[PASS] Backend API Online. Database mode: ${res.data.database}`);
      passedTests++;
    } else {
      console.log('[FAIL] Backend API returned unexpected status:', res);
      failedTests++;
    }
  } catch (err) {
    console.log('[FAIL] Cannot connect to Backend API (http://localhost:9141):', err.message);
    failedTests++;
  }

  // Test 2: Verify Agent IPC Status Endpoint (Live Hardware Telemetry)
  try {
    console.log('\nTest 2: Checking Local Agent IPC status & real hardware telemetry...');
    const res = await makeRequest('http://localhost:9140/api/status');
    if (res.status === 200 && res.data.agentStatus === 'RUNNING') {
      const diag = res.data.diagnostics;
      const tempStr = diag.cpu.temperatureC !== null ? `${diag.cpu.temperatureC}°C` : diag.cpu.sensorStatus;
      console.log(`[PASS] Agent Service Running`);
      console.log(`       Hardware Serial: ${diag.system.serialNumber}`);
      console.log(`       Model:           ${diag.system.model}`);
      console.log(`       CPU Load/Temp:   ${diag.cpu.loadPercent}% / ${tempStr}`);
      console.log(`       RAM Usage:       ${diag.memory.usedPercent}% (${diag.memory.usedGB}/${diag.memory.totalGB} GB)`);
      console.log(`       Storage (C:):    ${diag.storage.usedPercent}% used (${diag.storage.freeGB} GB free), SMART: ${diag.storage.smartStatus}`);
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
      console.log(`[PASS] Cleanup Scan successful: Found ${res.data.result.reclaimableMb} MB reclaimable across ${res.data.result.reclaimableFiles} items`);
      passedTests++;
    } else {
      console.log('[FAIL] Cleanup Scan failed:', res);
      failedTests++;
    }
  } catch (err) {
    console.log('[FAIL] Cleanup Scan error:', err.message);
    failedTests++;
  }

  // Test 4: Test Network Optimization Endpoint
  try {
    console.log('\nTest 4: Testing Network Optimization Endpoint...');
    const res = await makeRequest('http://localhost:9140/api/network/optimize', 'POST');
    if (res.status === 200 && res.data.success) {
      console.log(`[PASS] Network Optimization Endpoint online: ${res.data.message}`);
      passedTests++;
    } else {
      console.log('[FAIL] Network Optimization failed:', res);
      failedTests++;
    }
  } catch (err) {
    console.log('[FAIL] Network Optimization error:', err.message);
    failedTests++;
  }

  // Test 5: Test Threat Scan Endpoint
  try {
    console.log('\nTest 5: Testing Security Threat Scan Endpoint...');
    const res = await makeRequest('http://localhost:9140/api/security/scan', 'POST');
    if (res.status === 200 && res.data.success) {
      console.log(`[PASS] Security Scan Endpoint online: ${res.data.message}`);
      passedTests++;
    } else {
      console.log('[FAIL] Security Scan failed:', res);
      failedTests++;
    }
  } catch (err) {
    console.log('[FAIL] Security Scan error:', err.message);
    failedTests++;
  }

  // Test 6: Submit Test Support Ticket with Telemetry Snapshot
  let createdTicketId = null;
  try {
    console.log('\nTest 6: Testing Support Ticket Creation via Agent IPC...');
    const ticketPayload = {
      customerName: 'Tendai Moyo',
      customerEmail: 'tendai@company.co.zw',
      issueDescription: 'Avantis Hardware Diagnostic Escalation Test',
      priority: 'HIGH'
    };
    const res = await makeRequest('http://localhost:9140/api/support/ticket', 'POST', ticketPayload);
    if (res.status === 200 && res.data.success && res.data.ticket) {
      createdTicketId = res.data.ticket.id;
      console.log(`[PASS] Support Ticket Created Successfully: Ticket ID ${createdTicketId}`);
      passedTests++;
    } else {
      console.log('[FAIL] Ticket creation failed:', res);
      failedTests++;
    }
  } catch (err) {
    console.log('[FAIL] Ticket creation error:', err.message);
    failedTests++;
  }

  // Test 7: Verify Notification Subsystem Status
  try {
    console.log('\nTest 7: Verifying Notification Subsystem Status & Trigger...');
    const res = await makeRequest('http://localhost:9140/api/notifications/status');
    if (res.status === 200 && res.data.success && res.data.trackedSignals) {
      console.log(`[PASS] Notification Subsystem Online. Tracked signals: ${Object.keys(res.data.trackedSignals).join(', ')}`);
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
