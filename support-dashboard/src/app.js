const BACKEND_URL = 'http://localhost:9141';

let cachedDevices = [];
let cachedTickets = [];

async function loadDashboard() {
  await Promise.all([fetchDevices(), fetchAlerts(), fetchTickets()]);
}

async function fetchDevices() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/devices`);
    const data = await res.json();
    if (!data.success) return;

    cachedDevices = data.devices;
    document.getElementById('stat-total').innerText = data.count;
    document.getElementById('device-count-lbl').innerText = `${data.count} Devices Monitored`;

    const healthyCount = data.devices.filter(d => d.health_status === 'HEALTHY').length;
    document.getElementById('stat-healthy').innerText = healthyCount;

    renderDeviceTable(data.devices);
  } catch (err) {
    console.error('Error fetching devices:', err);
  }
}

function renderDeviceTable(devices) {
  const tbody = document.getElementById('device-table-body');
  if (devices.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--muted);">No Avantis PCs registered yet. Agent sync will register devices automatically.</td></tr>`;
    return;
  }

  tbody.innerHTML = devices.map(d => {
    const lastSeenStr = new Date(d.last_seen).toLocaleTimeString();
    return `
      <tr>
        <td class="mono"><strong>${d.serial_number || d.id}</strong></td>
        <td>${d.model}</td>
        <td>${d.hostname}</td>
        <td>${d.os_version}</td>
        <td><span class="badge badge-${d.health_status}">${d.health_status}</span></td>
        <td><strong>${d.health_score}/100</strong></td>
        <td>${lastSeenStr}</td>
        <td><button class="btn-sm" onclick="inspectDevice('${d.id}')">Inspect Telemetry</button></td>
      </tr>
    `;
  }).join('');
}

async function fetchAlerts() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/alerts`);
    const data = await res.json();
    if (data.success) {
      document.getElementById('stat-alerts').innerText = data.count;
    }
  } catch (err) {}
}

async function fetchTickets() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/tickets`);
    const data = await res.json();
    if (!data.success) return;

    cachedTickets = data.tickets;
    const openCount = data.tickets.filter(t => t.status === 'OPEN' || t.status === 'IN_PROGRESS').length;
    document.getElementById('stat-tickets').innerText = openCount;

    renderTicketTable(data.tickets);
  } catch (err) {}
}

function renderTicketTable(tickets) {
  const tbody = document.getElementById('ticket-table-body');
  if (tickets.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--muted);">No support tickets submitted.</td></tr>`;
    return;
  }

  tbody.innerHTML = tickets.map(t => {
    const createdStr = new Date(t.created_at).toLocaleString();
    return `
      <tr>
        <td class="mono"><strong>${t.id}</strong></td>
        <td>${t.customer_name}<br><span style="font-size: 12px; color: var(--muted);">${t.customer_email}</span></td>
        <td class="mono">${t.device_id}</td>
        <td style="max-width: 250px;">${t.issue_description}</td>
        <td><strong>${t.priority}</strong></td>
        <td><span class="badge badge-${t.status}">${t.status}</span></td>
        <td>${createdStr}</td>
        <td>
          ${t.status !== 'RESOLVED' 
            ? `<button class="btn-sm" style="background: var(--healthy); color: #ffffff; border: none;" onclick="updateTicketStatus('${t.id}', 'RESOLVED')">Resolve</button>` 
            : `<span style="font-size: 12px; font-weight: 700; color: var(--healthy);">Resolved</span>`}
        </td>
      </tr>
    `;
  }).join('');
}

async function updateTicketStatus(id, newStatus) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/tickets/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    if (res.ok) {
      fetchTickets();
    }
  } catch (err) {}
}

function inspectDevice(id) {
  const dev = cachedDevices.find(d => d.id === id);
  if (!dev) return;

  const specs = typeof dev.specs === 'string' ? JSON.parse(dev.specs) : dev.specs;

  document.getElementById('insp-title').innerText = `Inspector: ${dev.hostname} (${dev.serial_number})`;
  
  const body = document.getElementById('insp-body');
  body.innerHTML = `
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
      <div style="background: #f8fafc; padding: 20px; border-radius: 10px; border: 1px solid #e2e8f0;">
        <h4 style="margin-bottom: 12px; color: var(--avantis-teal); font-size: 12px; text-transform: uppercase; font-weight: 800;">Hardware Profile</h4>
        <p style="font-size: 13px; margin-bottom: 6px;"><strong>Model:</strong> ${dev.model}</p>
        <p style="font-size: 13px; margin-bottom: 6px;"><strong>Serial:</strong> ${dev.serial_number}</p>
        <p style="font-size: 13px; margin-bottom: 6px;"><strong>OS Version:</strong> ${dev.os_version}</p>
        <p style="font-size: 13px;"><strong>CPU:</strong> ${specs.system ? specs.system.cpuModel : 'Intel Core Processor'}</p>
      </div>

      <div style="background: #f8fafc; padding: 20px; border-radius: 10px; border: 1px solid #e2e8f0;">
        <h4 style="margin-bottom: 12px; color: var(--avantis-teal); font-size: 12px; text-transform: uppercase; font-weight: 800;">Telemetry Baseline</h4>
        <p style="font-size: 13px; margin-bottom: 6px;"><strong>CPU Load / Temp:</strong> ${specs.cpu ? specs.cpu.loadPercent + '% / ' + specs.cpu.temperatureC + '°C' : 'N/A'}</p>
        <p style="font-size: 13px; margin-bottom: 6px;"><strong>RAM Usage:</strong> ${specs.memory ? specs.memory.usedPercent + '% (' + specs.memory.usedGB + '/' + specs.memory.totalGB + ' GB)' : 'N/A'}</p>
        <p style="font-size: 13px; margin-bottom: 6px;"><strong>SMART Status:</strong> ${specs.storage ? specs.storage.smartStatus : 'PASSED'}</p>
        <p style="font-size: 13px; margin-bottom: 6px;"><strong>Reallocated Sectors:</strong> ${specs.storage ? specs.storage.reallocatedSectors : 0}</p>
        <p style="font-size: 13px;"><strong>Free Storage:</strong> ${specs.storage ? specs.storage.freePercent + '% (' + specs.storage.freeGB + ' GB)' : 'N/A'}</p>
      </div>
    </div>

    <div style="background: #f8fafc; padding: 20px; border-radius: 10px; border: 1px solid #e2e8f0;">
      <h4 style="margin-bottom: 10px; color: var(--muted); font-size: 12px; text-transform: uppercase; font-weight: 700;">Raw Telemetry JSON Payload</h4>
      <pre class="mono" style="background: #ffffff; padding: 16px; border-radius: 8px; font-size: 12px; max-height: 220px; overflow-y: auto; color: #0f172a; border: 1px solid #cbd5e1;">${JSON.stringify(specs, null, 2)}</pre>
    </div>
  `;

  document.getElementById('inspector-modal').style.display = 'flex';
}

function closeInspector() {
  document.getElementById('inspector-modal').style.display = 'none';
}

loadDashboard();
setInterval(loadDashboard, 5000);
