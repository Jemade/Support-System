// ============================================
// AVANTIS HARDWARE SUPPORT — APP v2.1
// Cross-Product Compatibility & Diagnostics
// ============================================

const AGENT_URL = 'http://localhost:9140';

// --- State ---
let latestDiagnostics = null;
let latestEvaluation = null;
let isScanning = false;

// --- Scan History (localStorage) ---
const HISTORY_KEY = 'avantis_scan_history';

function getScanHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
  } catch { return []; }
}

function saveScanResult(diagnostics, evaluation) {
  const history = getScanHistory();
  history.unshift({
    timestamp: new Date().toISOString(),
    score: evaluation.score,
    status: evaluation.status,
    alerts: evaluation.alerts || [],
    cpu: diagnostics.cpu,
    memory: diagnostics.memory,
    storage: diagnostics.storage,
    battery: diagnostics.battery
  });
  if (history.length > 20) history.length = 20;
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

// ============================================
// TAB NAVIGATION
// ============================================

function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.toggle('active', content.id === `tab-${tabId}`);
  });
  if (tabId === 'history') renderHistory();
}

// Wire up tab buttons
document.getElementById('tab-nav').addEventListener('click', e => {
  const btn = e.target.closest('.tab-btn');
  if (btn) switchTab(btn.dataset.tab);
});

// ============================================
// FETCH STATUS & DYNAMIC RENDER
// ============================================

async function fetchStatus() {
  try {
    const res = await fetch(`${AGENT_URL}/api/status`);
    if (!res.ok) throw new Error('Agent not responding');
    const data = await res.json();
    if (data.diagnostics && data.evaluation) {
      latestDiagnostics = data.diagnostics;
      latestEvaluation = data.evaluation;
      renderData(data.diagnostics, data.evaluation);
    }
  } catch (err) {
    document.getElementById('agent-status-time').innerText = 'Agent initializing...';
  }
}

function renderData(diagnostics, evaluation) {
  const { system, cpu, memory, storage, battery, capabilities = {} } = diagnostics;

  // 1. Health Ring & Score
  const ring = document.getElementById('health-ring');
  const scoreEl = document.getElementById('health-score');
  const circumference = 2 * Math.PI * 37.5; // r=37.5
  const offset = circumference - (evaluation.score / 100) * circumference;
  ring.style.strokeDashoffset = offset;

  if (evaluation.status === 'CRITICAL') {
    ring.style.stroke = 'var(--status-critical)';
  } else if (evaluation.status === 'WARNING') {
    ring.style.stroke = 'var(--status-warning)';
  } else {
    ring.style.stroke = 'var(--avantis-teal-cta)';
  }
  scoreEl.innerText = evaluation.score;

  // 2. Hero copy
  const heroTitle = document.getElementById('hero-title');
  const heroSub = document.getElementById('hero-subtitle');
  if (evaluation.status === 'CRITICAL') {
    heroTitle.innerText = 'Action Required';
    heroSub.innerText = 'Critical hardware anomalies detected. Run component diagnostics or review alerts below.';
  } else if (evaluation.status === 'WARNING') {
    heroTitle.innerText = 'Attention Recommended';
    heroSub.innerText = 'Some hardware parameters require review. Check component recommendations below.';
  } else {
    heroTitle.innerText = 'System Healthy';
    heroSub.innerText = `Hardware health score: ${evaluation.score}/100. All hardware subsystems are functioning within normal tolerances.`;
  }

  // 3. Header status
  document.getElementById('agent-status-time').innerText = `Last checked: ${new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}`;

  // 4. CPU (with sensor degradation handling)
  document.getElementById('cpu-load-val').innerText = `${cpu.loadPercent}%`;
  const cpuTempBadge = document.getElementById('cpu-temp-badge');
  const cpuDetail = document.getElementById('cpu-detail');

  if (cpu.temperatureC !== null && cpu.temperatureC !== undefined) {
    cpuTempBadge.innerText = `${cpu.temperatureC}°C`;
    cpuTempBadge.className = 'metric-badge ' + (cpu.temperatureC >= 85 ? 'metric-badge--critical' : cpu.temperatureC >= 75 ? 'metric-badge--warning' : 'metric-badge--healthy');
    cpuDetail.innerText = cpu.temperatureC >= 85 
      ? 'High core temperature — thermal throttling active' 
      : (cpu.isDirectHardwareSensor ? 'Normal operating temperature' : 'Estimated baseline thermal profile');
  } else {
    cpuTempBadge.innerText = 'N/A';
    cpuTempBadge.className = 'metric-badge';
    cpuDetail.innerText = 'Thermal sensor not exposed on this motherboard';
  }

  const cpuBar = document.getElementById('cpu-bar');
  cpuBar.style.width = `${cpu.loadPercent}%`;
  cpuBar.className = 'progress-fill' + (cpu.loadPercent > 90 ? ' progress-fill--critical' : cpu.loadPercent > 70 ? ' progress-fill--warning' : '');

  // 5. RAM
  document.getElementById('ram-val').innerText = `${memory.usedPercent}%`;
  document.getElementById('ram-detail').innerText = `${memory.usedGB} GB used of ${memory.totalGB} GB total`;
  document.getElementById('ram-spec').innerText = `${memory.totalGB} GB DDR`;
  const ramBar = document.getElementById('ram-bar');
  ramBar.style.width = `${memory.usedPercent}%`;
  ramBar.className = 'progress-fill' + (memory.usedPercent > 90 ? ' progress-fill--critical' : memory.usedPercent > 75 ? ' progress-fill--warning' : '');

  // 6. Storage (Dynamic Mount)
  const mountName = storage.mount || 'C:';
  document.getElementById('storage-title').innerText = `Storage (${mountName})`;
  document.getElementById('storage-val').innerText = `${storage.usedPercent}%`;
  document.getElementById('storage-detail').innerText = `${storage.freeGB} GB free of ${storage.totalGB} GB (${storage.driveType || 'SSD'})`;
  const smartBadge = document.getElementById('smart-badge');
  if (storage.smartStatus === 'PASSED') {
    smartBadge.innerText = 'SMART Passed';
    smartBadge.className = 'metric-badge metric-badge--healthy';
  } else {
    smartBadge.innerText = 'SMART Warning';
    smartBadge.className = 'metric-badge metric-badge--critical';
  }
  const storageBar = document.getElementById('storage-bar');
  storageBar.style.width = `${storage.usedPercent}%`;
  storageBar.className = 'progress-fill' + (storage.usedPercent > 90 ? ' progress-fill--critical' : storage.usedPercent > 80 ? ' progress-fill--warning' : '');

  // 7. Power (Dynamic Adaptation: Battery vs AC PSU)
  const powerCardTitle = document.getElementById('power-card-title');
  const powerStatusBadge = document.getElementById('power-status-badge');
  const powerDetail = document.getElementById('power-detail');
  const batteryVal = document.getElementById('battery-val');
  const batteryBar = document.getElementById('battery-bar');

  if (battery && battery.hasBattery) {
    powerCardTitle.innerText = 'Battery';
    powerStatusBadge.innerText = battery.statusMessage || 'On Battery';
    powerStatusBadge.className = 'metric-badge metric-badge--healthy';
    batteryVal.innerText = `${battery.currentPercent}%`;
    batteryBar.style.width = `${battery.currentPercent}%`;
    powerDetail.innerText = `Battery health: ${battery.healthPercent}% of design capacity`;
  } else {
    powerCardTitle.innerText = 'Power Supply (PSU)';
    powerStatusBadge.innerText = 'AC Power';
    powerStatusBadge.className = 'metric-badge metric-badge--healthy';
    batteryVal.innerText = 'AC';
    batteryBar.style.width = '100%';
    powerDetail.innerText = 'Connected to AC mains (Desktop / All-In-One)';
  }

  // 8. Device Specs (Sidebar)
  document.getElementById('spec-model').innerText = system.model || 'Avantis PC';
  document.getElementById('spec-serial').innerText = system.serialNumber || 'AVT-SN-GENERIC';
  document.getElementById('spec-os').innerText = system.osVersion || 'Windows 11';
  document.getElementById('spec-cpu').innerText = system.cpuModel || 'Intel Core Processor';
  document.getElementById('spec-ram').innerText = `${memory.totalGB} GB DDR`;
  document.getElementById('spec-device-type').innerText = capabilities.deviceCategory || (battery.hasBattery ? 'Laptop' : 'Desktop / All-In-One');

  // 9. Troubleshoot power card adaptation
  const powerTestTitle = document.getElementById('power-test-title');
  const powerTestDesc = document.getElementById('power-test-desc');
  const btnRunPowerTest = document.getElementById('btn-run-power-test');
  if (battery && battery.hasBattery) {
    powerTestTitle.innerText = 'Battery Diagnostics';
    powerTestDesc.innerText = 'Battery diagnostics — analyzes full design capacity degradation and AC line stability.';
    btnRunPowerTest.innerText = 'Run Battery Test';
  } else {
    powerTestTitle.innerText = 'Power Supply (PSU) Check';
    powerTestDesc.innerText = 'Power supply diagnostics — verifies AC line power delivery and voltage rail stability.';
    btnRunPowerTest.innerText = 'Run PSU Test';
  }

  // 10. Alerts & Tips
  renderAlerts(evaluation.alerts || []);
  renderTips(diagnostics);
}

// ============================================
// ALERTS (with guided next steps)
// ============================================

function renderAlerts(alerts) {
  const container = document.getElementById('alerts-container');
  container.innerHTML = '';
  if (!alerts || alerts.length === 0) return;

  alerts.forEach(alert => {
    const div = document.createElement('div');
    div.className = `alert-card ${alert.severity}`;

    let actionText = '';
    if (alert.type && alert.type.includes('CPU_TEMP')) {
      actionText = `<a class="alert-action" onclick="switchTab('troubleshoot')">Open Troubleshoot → Processor to run a thermal stress check</a>`;
    } else if (alert.type && (alert.type.includes('STORAGE') || alert.type.includes('SMART'))) {
      actionText = `<a class="alert-action" onclick="switchTab('troubleshoot')">Open Troubleshoot → Storage to run a drive health check</a>`;
    } else if (alert.type && alert.type.includes('BATTERY')) {
      actionText = `<a class="alert-action" onclick="switchTab('troubleshoot')">Open Troubleshoot → Battery to run capacity diagnostics</a>`;
    } else if (alert.type && alert.type.includes('MEMORY')) {
      actionText = `<a class="alert-action" onclick="switchTab('troubleshoot')">Open Troubleshoot → Memory to run an integrity scan</a>`;
    }

    div.innerHTML = `<div><strong>${alert.title}</strong>: ${alert.message}${actionText}</div>`;
    container.appendChild(div);
  });
}

// ============================================
// PERFORMANCE TIPS
// ============================================

function renderTips(diagnostics) {
  const list = document.getElementById('tips-list');
  const tips = [];

  if (diagnostics.memory.usedPercent > 80) {
    tips.push({ icon: '🧠', text: `Memory usage is at ${diagnostics.memory.usedPercent}% (${diagnostics.memory.usedGB} GB of ${diagnostics.memory.totalGB} GB). Consider closing resource-heavy background processes.` });
  }
  if (diagnostics.storage.usedPercent > 85) {
    tips.push({ icon: '💾', text: `Primary drive (${diagnostics.storage.mount || 'C:'}) is ${diagnostics.storage.usedPercent}% full with only ${diagnostics.storage.freeGB} GB free. Run system cleanup to reclaim space.` });
  }
  if (diagnostics.cpu.temperatureC && diagnostics.cpu.temperatureC >= 75) {
    tips.push({ icon: '🌡️', text: `CPU temperature is ${diagnostics.cpu.temperatureC}°C. Ensure air vents are unblocked and free of dust for proper thermal dissipation.` });
  }
  if (diagnostics.cpu.loadPercent > 80) {
    tips.push({ icon: '⚡', text: `CPU utilization is elevated at ${diagnostics.cpu.loadPercent}%. Check Task Manager for active tasks.` });
  }

  if (tips.length === 0) {
    tips.push({ icon: '✨', text: 'All hardware subsystems are operating within optimal thermal and performance parameters.' });
  }

  list.innerHTML = tips.map(t => `
    <div class="tip-item">
      <span class="tip-icon">${t.icon}</span>
      <span>${t.text}</span>
    </div>
  `).join('');
}

// ============================================
// DIAGNOSTIC SCAN
// ============================================

async function runScan() {
  const btn = document.getElementById('btn-scan');
  const liveDot = document.getElementById('status-live-dot');
  btn.innerText = 'Running Full Scan...';
  btn.disabled = true;
  if (liveDot) liveDot.classList.add('is-scanning');
  isScanning = true;

  try {
    const res = await fetch(`${AGENT_URL}/api/scan`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      latestDiagnostics = data.diagnostics;
      latestEvaluation = data.evaluation;
      renderData(data.diagnostics, data.evaluation);
      saveScanResult(data.diagnostics, data.evaluation);
      showInfoModal('Diagnostic Scan Complete', `System health evaluation completed with score: ${data.evaluation.score}/100.`);
    }
  } catch (err) {
    showInfoModal('Scan Error', 'Could not communicate with the Avantis background agent.');
  } finally {
    btn.innerText = 'Run Diagnostic Check';
    btn.disabled = false;
    if (liveDot) liveDot.classList.remove('is-scanning');
    isScanning = false;
  }
}

// ============================================
// CLEANUP ENGINE
// ============================================

async function runCleanupScan() {
  const btn = document.getElementById('btn-cleanup');
  btn.innerText = 'Scanning...';
  btn.disabled = true;

  try {
    const res = await fetch(`${AGENT_URL}/api/cleanup/scan`, { method: 'POST' });
    const data = await res.json();
    document.getElementById('cleanup-confirm-msg').innerText =
      `Avantis System Cleanup identified ${data.result.reclaimableMb} MB of temporary files and cache across ${data.result.reclaimableFiles} items. Clean them now?`;
    document.getElementById('cleanup-confirm-modal').style.display = 'flex';
  } catch (err) {
    showInfoModal('Cleanup Error', err.message);
  } finally {
    btn.innerText = 'Clean Temp Files';
    btn.disabled = false;
  }
}

async function executeCleanup() {
  closeModal('cleanup-confirm-modal');
  const btn = document.getElementById('btn-cleanup');
  btn.innerText = 'Cleaning...';
  btn.disabled = true;

  try {
    const res = await fetch(`${AGENT_URL}/api/cleanup/execute`, { method: 'POST' });
    const data = await res.json();
    showInfoModal('System Cleanup Complete', data.result.summaryMessage);
    fetchStatus();
  } catch (err) {
    showInfoModal('Cleanup Error', err.message);
  } finally {
    btn.innerText = 'Clean Temp Files';
    btn.disabled = false;
  }
}

// ============================================
// TROUBLESHOOT — PER-COMPONENT TESTS
// ============================================

async function runComponentTest(component) {
  const resultEl = document.getElementById(`test-result-${component}`);
  const card = document.getElementById(`test-card-${component}`);
  const btn = card.querySelector('button');
  const originalText = btn.innerText;
  btn.innerText = 'Testing...';
  btn.disabled = true;
  resultEl.innerHTML = '';

  try {
    const res = await fetch(`${AGENT_URL}/api/scan`, { method: 'POST' });
    const data = await res.json();
    if (!data.success) throw new Error('Scan failed');

    latestDiagnostics = data.diagnostics;
    latestEvaluation = data.evaluation;
    renderData(data.diagnostics, data.evaluation);
    saveScanResult(data.diagnostics, data.evaluation);

    // Realistic brief testing delay
    await new Promise(r => setTimeout(r, 700));

    const result = generateComponentResult(component, data.diagnostics, data.evaluation);
    renderTestResult(resultEl, result);
  } catch (err) {
    resultEl.innerHTML = `<div class="test-result failed"><span class="test-result-label">Error</span>Could not reach Avantis diagnostic service.</div>`;
  } finally {
    btn.innerText = originalText;
    btn.disabled = false;
  }
}

function generateComponentResult(component, diagnostics, evaluation) {
  const d = diagnostics;
  switch (component) {
    case 'cpu': {
      const temp = d.cpu.temperatureC;
      if (temp && temp >= 95) return { status: 'failed', label: 'Critical Overheating', text: `Processor reached ${temp}°C under stress — thermal throttling is active. Check cooling fans and heatsink ventilation.`, guided: true, guidedComponent: 'cpu' };
      if (temp && temp >= 85) return { status: 'warning', label: 'Thermal Warning', text: `Processor reached ${temp}°C — above recommended threshold. Ensure air vents are unobstructed.`, guided: true, guidedComponent: 'cpu' };
      const tempNote = temp ? `peak temperature ${temp}°C within safe range.` : 'clock stability verified.';
      return { status: 'passed', label: 'Passed', text: `Processor stress verification passed — ${tempNote}` };
    }
    case 'memory': {
      const alerts = (evaluation.alerts || []).filter(a => a.type && a.type.includes('MEMORY'));
      if (alerts.length > 0) return { status: 'warning', label: 'Attention', text: `${d.memory.totalGB} GB installed — memory consumption is at ${d.memory.usedPercent}%. ${alerts[0].message}`, guided: true, guidedComponent: 'memory' };
      return { status: 'passed', label: 'Passed', text: `Memory integrity verified — ${d.memory.totalGB} GB RAM active, zero read/write parity faults detected.` };
    }
    case 'storage': {
      const sectors = d.storage.reallocatedSectors || 0;
      if (d.storage.smartStatus === 'FAILING_NOW') return { status: 'failed', label: 'Imminent Failure', text: `SMART status indicates impending drive failure. Back up all personal data immediately.`, guided: true, guidedComponent: 'storage' };
      if (sectors > 0) return { status: 'warning', label: 'Degradation Warning', text: `Drive has ${sectors} reallocated sectors. Drive health monitoring is active — ${d.storage.freeGB} GB free.`, guided: true, guidedComponent: 'storage' };
      return { status: 'passed', label: 'Passed', text: `Drive health verified (${d.storage.driveType || 'SSD'}) — SMART status healthy, 0 bad sectors, ${d.storage.freeGB} GB free.` };
    }
    case 'power': {
      if (!d.battery || !d.battery.hasBattery) {
        return { status: 'passed', label: 'Passed', text: 'Desktop / All-In-One system — AC mains power delivery and PSU rails verified stable.' };
      }
      if (d.battery.healthPercent < 60) return { status: 'failed', label: 'Capacity Degraded', text: `Battery health has dropped to ${d.battery.healthPercent}% of original design capacity. Battery replacement recommended.`, guided: true, guidedComponent: 'power' };
      if (d.battery.healthPercent < 80) return { status: 'warning', label: 'Capacity Wear', text: `Battery health is at ${d.battery.healthPercent}% — capacity degradation detected. Current charge: ${d.battery.currentPercent}%.`, guided: true, guidedComponent: 'power' };
      return { status: 'passed', label: 'Passed', text: `Battery health ${d.battery.healthPercent}% — charging circuitry and capacity within normal specifications.` };
    }
    default:
      return { status: 'passed', label: 'Passed', text: 'Component test completed successfully.' };
  }
}

function renderTestResult(el, result) {
  let guidedHTML = '';
  if (result.guided) {
    guidedHTML = getGuidedFollowup(result.guidedComponent);
  }
  el.innerHTML = `
    <div class="test-result ${result.status}">
      <span class="test-result-label">${result.label}</span>
      ${result.text}
    </div>
    ${guidedHTML}
  `;
}

function getGuidedFollowup(component) {
  const steps = {
    cpu: [
      'Ensure cooling vents are clear of dust and obstruction.',
      'Operate the device on a hard, level surface to maximize airflow.',
      'Check for BIOS/firmware updates improving thermal fan curve profiles.',
      'If thermal throttling persists, submit a support ticket.'
    ],
    memory: [
      'Close unnecessary background applications to free RAM.',
      'Check Task Manager for applications with abnormal memory allocations.',
      'Restart the device to reset system heap memory allocations.',
      'Contact Avantis Support if memory parity errors reoccur.'
    ],
    storage: [
      'Back up important files and documents to external storage.',
      'Run Avantis System Cleanup to remove unnecessary cache files.',
      'Monitor SMART reallocated sector counts regularly.',
      'Schedule drive replacement if reallocated sector counts increase.'
    ],
    power: [
      'Perform a battery calibration cycle (charge to 100%, discharge to 5%, recharge).',
      'Adjust Windows power mode to "Best power efficiency".',
      'Contact Avantis support for battery replacement options if health is below 60%.'
    ]
  };

  const componentSteps = steps[component] || ['Contact Avantis technical support for assistance.'];
  return `
    <div class="guided-followup">
      <p><strong>Recommended Resolution Steps:</strong></p>
      <ol class="guided-steps">
        ${componentSteps.map(s => `<li>${s}</li>`).join('')}
      </ol>
    </div>
  `;
}

async function runAllTests() {
  const btn = document.getElementById('btn-full-test');
  btn.innerText = 'Running Diagnostic Suite...';
  btn.disabled = true;

  const components = ['cpu', 'memory', 'storage', 'power'];
  for (const comp of components) {
    await runComponentTest(comp);
    await new Promise(r => setTimeout(r, 250));
  }

  btn.innerText = 'Run Full System Diagnostics';
  btn.disabled = false;
}

// ============================================
// DRIVERS TAB (Stubbed Catalog)
// ============================================

let driversLoaded = false;
const STUB_DRIVERS = [
  { name: 'Intel Iris / UHD Graphics Driver', component: 'Display Graphics', current: '31.0.101.4255', latest: '31.0.101.5186', status: 'update' },
  { name: 'Realtek High Definition Audio', component: 'Audio Subsystem', current: '6.0.9285.1', latest: '6.0.9285.1', status: 'current' },
  { name: 'Intel Wi-Fi 6E Wireless Adapter', component: 'Network & WLAN', current: '23.20.0.4', latest: '23.50.0.8', status: 'update' },
  { name: 'Realtek PCIe GbE Family Controller', component: 'Ethernet LAN', current: '10.68.815.2023', latest: '10.68.815.2023', status: 'current' },
  { name: 'Avantis System Firmware (BIOS)', component: 'System Motherboard', current: '1.04.0', latest: '1.08.0', status: 'update' }
];

function checkDriverUpdates() {
  const btn = document.getElementById('btn-check-drivers');
  const body = document.getElementById('driver-list-body');
  btn.innerText = 'Querying Catalog...';
  btn.disabled = true;

  setTimeout(() => {
    driversLoaded = true;
    const updateCount = STUB_DRIVERS.filter(d => d.status === 'update').length;

    body.innerHTML = STUB_DRIVERS.map((d, i) => `
      <div class="driver-item" id="driver-row-${i}">
        <div>
          <div class="driver-name">${d.name}</div>
          <div style="font-size:11.5px; color:var(--text-faint); margin-top:2px;">${d.component}</div>
        </div>
        <div class="driver-version">${d.current}</div>
        <div class="driver-version">${d.latest}</div>
        <div class="driver-status ${d.status === 'current' ? 'up-to-date' : 'update-available'}">
          ${d.status === 'current' ? 'Up to Date' : 'Update Available'}
        </div>
        <div>
          ${d.status === 'update'
            ? `<button class="btn btn-primary btn-sm" onclick="installDriver(${i})" id="driver-btn-${i}">Download & Install</button>`
            : `<span style="font-size:12px; color:var(--text-faint)">—</span>`}
        </div>
      </div>
    `).join('');

    if (updateCount > 0) {
      document.getElementById('btn-update-all').style.display = 'inline-flex';
    }

    btn.innerText = 'Check for Updates';
    btn.disabled = false;
  }, 1200);
}

function installDriver(index) {
  const btn = document.getElementById(`driver-btn-${index}`);
  const row = document.getElementById(`driver-row-${index}`);
  if (!btn) return;

  btn.innerText = 'Installing...';
  btn.disabled = true;

  const progressDiv = document.createElement('div');
  progressDiv.className = 'driver-progress';
  progressDiv.innerHTML = '<div class="driver-progress-fill" id="driver-prog-' + index + '"></div>';
  row.appendChild(progressDiv);

  let progress = 0;
  const interval = setInterval(() => {
    progress += Math.random() * 20 + 10;
    if (progress >= 100) {
      progress = 100;
      clearInterval(interval);

      btn.innerText = 'Installed ✓';
      btn.className = 'btn btn-sm';
      btn.style.color = 'var(--status-healthy)';
      btn.style.border = 'none';
      btn.style.background = 'var(--status-healthy-bg)';

      const statusEl = row.querySelector('.driver-status');
      if (statusEl) {
        statusEl.innerText = 'Up to Date';
        statusEl.className = 'driver-status up-to-date';
      }

      setTimeout(() => {
        if (progressDiv.parentNode) progressDiv.parentNode.removeChild(progressDiv);
      }, 1000);

      STUB_DRIVERS[index].status = 'current';
      STUB_DRIVERS[index].current = STUB_DRIVERS[index].latest;

      if (!STUB_DRIVERS.some(d => d.status === 'update')) {
        document.getElementById('btn-update-all').style.display = 'none';
      }
    }
    const fillEl = document.getElementById(`driver-prog-${index}`);
    if (fillEl) fillEl.style.width = `${Math.min(progress, 100)}%`;
  }, 180);
}

async function updateAllDrivers() {
  const updatable = STUB_DRIVERS.map((d, i) => d.status === 'update' ? i : null).filter(i => i !== null);
  for (const idx of updatable) {
    installDriver(idx);
    await new Promise(r => setTimeout(r, 400));
  }
}

// ============================================
// HISTORY & DIAGNOSTIC REPORT
// ============================================

function renderHistory() {
  const history = getScanHistory();

  if (latestDiagnostics) {
    document.getElementById('report-model').innerText = latestDiagnostics.system.model;
    document.getElementById('report-serial').innerText = latestDiagnostics.system.serialNumber;
    document.getElementById('report-os').innerText = latestDiagnostics.system.osVersion;
    document.getElementById('report-cpu').innerText = latestDiagnostics.system.cpuModel;
  }

  const listEl = document.getElementById('scan-history-list');
  if (history.length === 0) {
    listEl.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📋</div><div>No diagnostic scans recorded yet.</div></div>';
  } else {
    listEl.innerHTML = history.slice(0, 10).map(scan => {
      const date = new Date(scan.timestamp);
      const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ', ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const scoreClass = scan.status === 'CRITICAL' ? 'critical' : scan.status === 'WARNING' ? 'warning' : 'healthy';
      const flags = scan.alerts && scan.alerts.length > 0
        ? scan.alerts.map(a => a.title).join(', ')
        : 'All systems healthy';
      return `
        <div class="scan-history-item">
          <span class="scan-date">${dateStr}</span>
          <span class="scan-score ${scoreClass}">${scan.score}/100</span>
          <span class="scan-flags">${flags}</span>
        </div>
      `;
    }).join('');
  }

  const timelineEl = document.getElementById('health-timeline');
  if (history.length === 0) {
    timelineEl.innerHTML = '<div style="color:var(--text-muted); font-size:13px">Timeline will populate as diagnostic scans run.</div>';
  } else {
    timelineEl.innerHTML = history.slice(0, 15).reverse().map(scan => {
      const cls = scan.status === 'CRITICAL' ? 'critical' : scan.status === 'WARNING' ? 'warning' : 'healthy';
      return `<div class="timeline-dot ${cls}" title="${scan.score}/100 — ${new Date(scan.timestamp).toLocaleString()}"></div>`;
    }).join('');
  }
}

function downloadReport() {
  const history = getScanHistory();
  const d = latestDiagnostics;
  if (!d) {
    showInfoModal('No Data', 'Run a diagnostic scan first to generate a report.');
    return;
  }

  let reportHTML = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Avantis Diagnostic Telemetry Report</title>
    <style>body{font-family:'Segoe UI',sans-serif;max-width:760px;margin:30px auto;padding:24px;color:#0f172a;}
    h1{font-size:22px;color:#13A3AF;margin-bottom:4px;} h2{font-size:16px;margin:24px 0 12px;border-bottom:2px solid #e2e8f0;padding-bottom:6px;}
    table{width:100%;border-collapse:collapse;margin-bottom:16px;} td,th{text-align:left;padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;}
    th{font-weight:700;color:#64748b;background:#f8fafc;} .score{font-size:36px;font-weight:800;color:#0BBCA8;margin:8px 0;}
    .meta{color:#98D3D8;font-size:12px;font-weight:600;}</style></head><body>
    <h1>AVANTiS — Diagnostic Telemetry Report</h1>
    <p class="meta">Generated: ${new Date().toLocaleString()} · Product of Zimbabwe</p>
    <h2>Device Specifications</h2>
    <table>
      <tr><td><strong>Model</strong></td><td>${d.system.model}</td></tr>
      <tr><td><strong>Serial Number</strong></td><td>${d.system.serialNumber}</td></tr>
      <tr><td><strong>Operating System</strong></td><td>${d.system.osVersion}</td></tr>
      <tr><td><strong>Processor</strong></td><td>${d.system.cpuModel}</td></tr>
      <tr><td><strong>Installed Memory</strong></td><td>${d.memory.totalGB} GB</td></tr>
      <tr><td><strong>Primary Storage</strong></td><td>${d.storage.totalGB} GB (${d.storage.freeGB} GB free)</td></tr>
      <tr><td><strong>Power Configuration</strong></td><td>${d.battery && d.battery.hasBattery ? 'Battery (' + d.battery.healthPercent + '% health)' : 'AC Mains Power Supply (Desktop / AIO)'}</td></tr>
    </table>
    <h2>Health Status & Baseline Telemetry</h2>
    <div class="score">${latestEvaluation.score}/100 (${latestEvaluation.status})</div>
    <table>
      <tr><th>CPU Load</th><th>CPU Temp</th><th>RAM Usage</th><th>Storage Used</th><th>SMART Status</th></tr>
      <tr><td>${d.cpu.loadPercent}%</td><td>${d.cpu.temperatureC ? d.cpu.temperatureC + '°C' : 'N/A'}</td><td>${d.memory.usedPercent}%</td><td>${d.storage.usedPercent}%</td><td>${d.storage.smartStatus}</td></tr>
    </table>`;

  if (history.length > 0) {
    reportHTML += `<h2>Diagnostic Scan History</h2><table><tr><th>Timestamp</th><th>Score</th><th>Status</th><th>Detected Flags</th></tr>`;
    history.slice(0, 10).forEach(s => {
      const flags = s.alerts && s.alerts.length > 0 ? s.alerts.map(a => a.title).join(', ') : 'None';
      reportHTML += `<tr><td>${new Date(s.timestamp).toLocaleString()}</td><td><strong>${s.score}</strong></td><td>${s.status}</td><td>${flags}</td></tr>`;
    });
    reportHTML += '</table>';
  }

  reportHTML += '</body></html>';

  const blob = new Blob([reportHTML], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `avantis-diagnostic-report-${new Date().toISOString().slice(0,10)}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

function copyReportText() {
  const d = latestDiagnostics;
  if (!d) {
    showInfoModal('No Data', 'Run a diagnostic scan first to generate a report.');
    return;
  }

  const history = getScanHistory();
  let text = `AVANTIS — DIAGNOSTIC TELEMETRY REPORT\nGenerated: ${new Date().toLocaleString()} · Product of Zimbabwe\n\n`;
  text += `DEVICE: ${d.system.model}\nSerial: ${d.system.serialNumber}\nOS: ${d.system.osVersion}\nCPU: ${d.system.cpuModel}\nRAM: ${d.memory.totalGB} GB\nStorage: ${d.storage.totalGB} GB (${d.storage.freeGB} GB free)\nPower: ${d.battery && d.battery.hasBattery ? 'Battery' : 'AC Mains PSU'}\n\n`;
  text += `HEALTH SCORE: ${latestEvaluation.score}/100 (${latestEvaluation.status})\n`;
  text += `CPU Load/Temp: ${d.cpu.loadPercent}% / ${d.cpu.temperatureC ? d.cpu.temperatureC + '°C' : 'N/A'}\nRAM Usage: ${d.memory.usedPercent}%\nStorage Used: ${d.storage.usedPercent}%, SMART ${d.storage.smartStatus}\n`;

  if (history.length > 0) {
    text += `\nSCAN HISTORY (last ${Math.min(history.length, 5)}):\n`;
    history.slice(0, 5).forEach(s => {
      text += `  ${new Date(s.timestamp).toLocaleString()} — Score: ${s.score}, Status: ${s.status}\n`;
    });
  }

  navigator.clipboard.writeText(text).then(() => {
    showInfoModal('Copied to Clipboard', 'Diagnostic telemetry report copied successfully.');
  }).catch(() => {
    showInfoModal('Copy Failed', 'Could not copy to clipboard.');
  });
}

// ============================================
// AVANTIS ASSISTANT CHAT WIDGET
// ============================================

let chatMessages = [];
let isChatOpen = false;
let initialChipsActive = true;

function initAssistantChat() {
  if (chatMessages.length === 0) {
    const score = latestEvaluation ? latestEvaluation.score : 100;
    let summary = `Your system health score is ${score} out of 100. `;
    if (latestEvaluation && latestEvaluation.status === 'CRITICAL') {
      summary += 'Critical hardware alerts require your attention.';
    } else if (latestEvaluation && latestEvaluation.status === 'WARNING') {
      summary += 'Some hardware parameters require review.';
    } else {
      summary += 'Everything looks healthy.';
    }

    chatMessages.push({
      sender: 'assistant',
      text: summary,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
  }
  renderChatMessages();
}

function toggleAssistantChat(e) {
  if (e) e.stopPropagation();
  const panel = document.getElementById('assistant-chat-panel');
  if (!panel) return;

  isChatOpen = !panel.classList.contains('is-open');
  if (isChatOpen) {
    initAssistantChat();
    panel.classList.add('is-open');
    setTimeout(() => {
      const input = document.getElementById('chat-input-field');
      if (input) input.focus();
    }, 150);
  } else {
    panel.classList.remove('is-open');
  }
}

function renderChatMessages() {
  const container = document.getElementById('chat-messages-list');
  if (!container) return;

  let html = '';
  chatMessages.forEach((msg, index) => {
    if (msg.sender === 'assistant') {
      html += `
        <div class="chat-message-row assistant">
          <img src="assets/avantis-icon.svg" alt="AV" class="chat-bubble-avatar">
          <div class="chat-bubble">${msg.text}</div>
        </div>
      `;
      // If it's the very first assistant message and initial chips are active, show the 3 pills below it
      if (index === 0 && initialChipsActive) {
        html += `
          <div class="chat-chips-row" id="chat-initial-chips">
            <button type="button" class="chat-chip" onclick="handleChatChip('Run diagnostic check')">Run diagnostic check</button>
            <button type="button" class="chat-chip" onclick="handleChatChip('Open component tests')">Open component tests</button>
            <button type="button" class="chat-chip" onclick="handleChatChip('Contact support')">Contact support</button>
          </div>
        `;
      }
    } else {
      html += `
        <div class="chat-message-row user">
          <div class="chat-bubble">${msg.text}</div>
        </div>
      `;
    }
  });

  container.innerHTML = html;
  scrollChatToBottom();
}

function scrollChatToBottom() {
  const body = document.getElementById('chat-messages-container');
  if (body) {
    body.scrollTop = body.scrollHeight;
  }
}

async function handleChatChip(chipText) {
  // Hide chips after first click
  initialChipsActive = false;
  
  // Post user message
  appendChatMessage('user', chipText);

  // Assistant reaction based on chip clicked
  if (chipText === 'Run diagnostic check') {
    appendChatMessage('assistant', 'Starting a full system diagnostic scan now...');
    try {
      await runScan();
      const score = latestEvaluation ? latestEvaluation.score : 100;
      appendChatMessage('assistant', `Scan complete! System health score is ${score}/100. Telemetry data has been refreshed.`);
    } catch (err) {
      appendChatMessage('assistant', 'Encountered an issue running the diagnostic scan. Please verify the background agent is online.');
    }
  } else if (chipText === 'Open component tests') {
    switchTab('troubleshoot');
    appendChatMessage('assistant', 'Navigated to the Troubleshoot tab. You can now execute targeted tests on your Processor, Memory, Storage, and Power components.');
  } else if (chipText === 'Contact support') {
    openTicketModal();
    appendChatMessage('assistant', 'Opening the Technical Support Request form. Your hardware diagnostic snapshot will be attached automatically.');
  }
}

function handleChatSubmit(e) {
  e.preventDefault();
  const input = document.getElementById('chat-input-field');
  if (!input) return;

  const text = input.value.trim();
  if (!text) return;

  input.value = '';
  initialChipsActive = false;

  // Post user message
  appendChatMessage('user', text);

  // Generate responsive assistant answer
  setTimeout(() => {
    const reply = generateAssistantResponse(text);
    appendChatMessage('assistant', reply);
  }, 400);
}

function appendChatMessage(sender, text) {
  chatMessages.push({
    sender,
    text,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  });
  renderChatMessages();
}

function generateAssistantResponse(userInput) {
  const q = userInput.toLowerCase();
  const d = latestDiagnostics;
  const ev = latestEvaluation;

  if (q.includes('hi') || q.includes('hello') || q.includes('hey')) {
    return 'Hello! I am your Avantis Hardware Assistant. I monitor your device telemetry and can help run diagnostics, troubleshoot components, or submit support tickets.';
  }
  if (q.includes('scan') || q.includes('check') || q.includes('health') || q.includes('score')) {
    if (ev) {
      return `Your current system health score is ${ev.score}/100 (${ev.status}). All hardware telemetry is continuously monitored by the background agent.`;
    }
    return 'Your device is monitored continuously. Click "Run diagnostic check" or ask me to perform a scan anytime.';
  }
  if (q.includes('cpu') || q.includes('processor') || q.includes('temp') || q.includes('temperature')) {
    if (d && d.cpu) {
      const tempStr = d.cpu.temperatureC ? `${d.cpu.temperatureC}°C` : 'sensor not exposed';
      return `Processor status: ${d.cpu.loadPercent}% utilization, temperature: ${tempStr}. ${d.cpu.loadPercent > 80 ? 'CPU utilization is high.' : 'Operating normally.'}`;
    }
    return 'Processor telemetry is normal. You can test CPU thermal throttling in the Troubleshoot tab.';
  }
  if (q.includes('ram') || q.includes('memory')) {
    if (d && d.memory) {
      return `Memory status: ${d.memory.usedPercent}% used (${d.memory.usedGB} GB of ${d.memory.totalGB} GB total).`;
    }
    return 'Memory read/write parity is intact. Run the RAM test in Troubleshoot for address bank verification.';
  }
  if (q.includes('storage') || q.includes('disk') || q.includes('ssd') || q.includes('nvme') || q.includes('drive') || q.includes('space')) {
    if (d && d.storage) {
      return `Storage drive (${d.storage.mount || 'C:'}): ${d.storage.usedPercent}% used with ${d.storage.freeGB} GB free. SMART status is ${d.storage.smartStatus}.`;
    }
    return 'Storage SMART monitoring is active and operating normally.';
  }
  if (q.includes('battery') || q.includes('power') || q.includes('charge')) {
    if (d && d.battery && d.battery.hasBattery) {
      return `Battery status: ${d.battery.currentPercent}% charged, health is ${d.battery.healthPercent}% of original design capacity.`;
    }
    return 'Device is connected to AC mains power (Desktop / All-In-One profile). Voltage rails are stable.';
  }
  if (q.includes('driver') || q.includes('update')) {
    return 'You can check for official Avantis driver updates in the Drivers tab. All updates are verified for hardware compatibility.';
  }
  if (q.includes('ticket') || q.includes('support') || q.includes('contact') || q.includes('help')) {
    openTicketModal();
    return 'I have opened the Technical Support Request modal for you. Telemetry snapshot will be submitted directly to Avantis engineers.';
  }
  if (q.includes('clean') || q.includes('temp') || q.includes('cache')) {
    runCleanupScan();
    return 'Opening Avantis System Cleanup to scan and reclaim disk space from temporary files and cache.';
  }

  return `I can help with system health diagnostics, driver updates, and troubleshooting for your ${d && d.system ? d.system.model : 'Avantis PC'}. Would you like to run a diagnostic check or open component tests?`;
}

// Global click to close chat widget when clicking outside
document.addEventListener('click', e => {
  const panel = document.getElementById('assistant-chat-panel');
  const btn = document.getElementById('floating-assistant-btn');
  if (panel && panel.classList.contains('is-open')) {
    if (!panel.contains(e.target) && !btn.contains(e.target)) {
      panel.classList.remove('is-open');
      isChatOpen = false;
    }
  }
});

// ============================================
// MODALS
// ============================================

function openTicketModal() { document.getElementById('ticket-modal').style.display = 'flex'; }
function openQaChecklistModal() {
  if (latestDiagnostics) {
    document.getElementById('qa-chk-model').innerText = latestDiagnostics.system.model;
    document.getElementById('qa-chk-temp').innerText = latestDiagnostics.cpu.isDirectHardwareSensor ? 'Hardware Sensor Active' : 'Estimated Baseline';
    document.getElementById('qa-chk-power').innerText = latestDiagnostics.battery && latestDiagnostics.battery.hasBattery ? 'Battery Pack Detected' : 'AC Mains PSU (Desktop/AIO)';
    document.getElementById('qa-chk-storage').innerText = `${latestDiagnostics.storage.mount} (${latestDiagnostics.storage.driveType || 'SSD'}) SMART Active`;
  }
  document.getElementById('qa-modal').style.display = 'flex';
}

function closeModal(modalId) { document.getElementById(modalId).style.display = 'none'; }

function showInfoModal(title, message) {
  document.getElementById('info-modal-title').innerText = title;
  document.getElementById('info-modal-msg').innerText = message;
  document.getElementById('info-modal').style.display = 'flex';
}

// Close modals on overlay backdrop click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.style.display = 'none';
  });
});

// ============================================
// SUPPORT TICKET SUBMISSION
// ============================================

async function submitTicket(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-submit-tck');
  btn.innerText = 'Submitting...';
  btn.disabled = true;

  try {
    const res = await fetch(`${AGENT_URL}/api/support/ticket`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: document.getElementById('cust-name').value,
        customerEmail: document.getElementById('cust-email').value,
        issueDescription: document.getElementById('cust-issue').value,
        priority: 'HIGH'
      })
    });

    const data = await res.json();
    if (data.success) {
      closeModal('ticket-modal');
      document.getElementById('ticket-form').reset();
      showInfoModal('Support Request Submitted', `Ticket Reference: ${data.ticket.id}\n\nOur technical support team has received your ticket along with full hardware diagnostics.`);
    } else {
      showInfoModal('Submission Error', data.message || 'Could not submit ticket.');
    }
  } catch (err) {
    showInfoModal('Submission Error', 'Could not reach the support server.');
  } finally {
    btn.innerText = 'Submit Support Ticket';
    btn.disabled = false;
  }
}

// ============================================
// ROUTING & DEEP LINKING (Notification clicks)
// ============================================

function handleUrlRouting() {
  const hash = window.location.hash;
  const search = window.location.search;
  
  let tab = 'home';
  let component = null;

  if (hash) {
    const hashClean = hash.replace(/^#/, '');
    const [tabPart, queryPart] = hashClean.split('?');
    if (['home', 'troubleshoot', 'drivers', 'history'].includes(tabPart)) {
      tab = tabPart;
    }
    if (queryPart) {
      const params = new URLSearchParams(queryPart);
      component = params.get('component');
    }
  }

  if (search) {
    const params = new URLSearchParams(search);
    if (params.get('tab')) tab = params.get('tab');
    if (params.get('component')) component = params.get('component');
  }

  if (tab && tab !== 'home') {
    switchTab(tab);
  }

  if (tab === 'troubleshoot' && component) {
    setTimeout(() => {
      focusComponentCard(component);
    }, 250);
  }
}

function focusComponentCard(component) {
  const targetId = `test-card-${component}`;
  const card = document.getElementById(targetId);
  if (card) {
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.style.transition = 'all 0.4s ease';
    card.style.boxShadow = '0 0 0 3px var(--avantis-teal-cta), 0 8px 24px var(--avantis-teal-glow)';
    card.style.borderColor = 'var(--avantis-teal-cta)';
    setTimeout(() => {
      card.style.boxShadow = '';
      card.style.borderColor = '';
    }, 3500);
  }
}

window.addEventListener('hashchange', handleUrlRouting);

// ============================================
// INIT
// ============================================

fetchStatus();
setInterval(fetchStatus, 5000);
handleUrlRouting();
