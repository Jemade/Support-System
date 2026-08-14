const { Pool } = require('pg');

class PostgreSQLDatabase {
  constructor() {
    this.connectionString = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/avantis_db';
    this.pool = null;
    this.isNativePgConnected = false;
    this.inMemoryStore = {
      devices: new Map(),
      telemetry: [],
      alerts: [],
      tickets: new Map()
    };
  }

  async init() {
    try {
      this.pool = new Pool({
        connectionString: this.connectionString,
        connectionTimeoutMillis: 2000
      });

      // Test connection
      const client = await this.pool.connect();
      client.release();
      this.isNativePgConnected = true;
      console.log('[Database] Successfully connected to PostgreSQL Server');
      await this.createTables();
    } catch (err) {
      console.log('[Database] Live PostgreSQL server not detected on localhost:5432. Activating PostgreSQL in-memory fallback adapter.');
      this.isNativePgConnected = false;
    }
  }

  async createTables() {
    if (!this.isNativePgConnected) return;

    const queries = [
      `CREATE TABLE IF NOT EXISTS devices (
        id VARCHAR(100) PRIMARY KEY,
        hostname VARCHAR(255),
        model VARCHAR(255),
        serial_number VARCHAR(100),
        os_version VARCHAR(255),
        health_status VARCHAR(50),
        health_score INT,
        last_seen TIMESTAMP WITH TIME ZONE,
        specs JSONB
      );`,

      `CREATE TABLE IF NOT EXISTS telemetry_history (
        id SERIAL PRIMARY KEY,
        device_id VARCHAR(100) REFERENCES devices(id),
        cpu_load INT,
        cpu_temp INT,
        ram_used_percent INT,
        storage_free_percent INT,
        storage_smart_status VARCHAR(50),
        battery_health_percent INT,
        metrics JSONB,
        recorded_at TIMESTAMP WITH TIME ZONE
      );`,

      `CREATE TABLE IF NOT EXISTS alerts (
        id SERIAL PRIMARY KEY,
        device_id VARCHAR(100),
        alert_type VARCHAR(100),
        severity VARCHAR(50),
        title VARCHAR(255),
        message TEXT,
        status VARCHAR(50) DEFAULT 'ACTIVE',
        created_at TIMESTAMP WITH TIME ZONE
      );`,

      `CREATE TABLE IF NOT EXISTS tickets (
        id VARCHAR(100) PRIMARY KEY,
        device_id VARCHAR(100),
        customer_name VARCHAR(255),
        customer_email VARCHAR(255),
        issue_description TEXT,
        priority VARCHAR(50),
        diagnostic_snapshot JSONB,
        status VARCHAR(50) DEFAULT 'OPEN',
        created_at TIMESTAMP WITH TIME ZONE,
        updated_at TIMESTAMP WITH TIME ZONE
      );`
    ];

    for (const q of queries) {
      await this.pool.query(q);
    }
  }

  // Devices CRUD
  async upsertDevice(deviceData) {
    const { deviceId, hostname, model, serialNumber, osVersion, healthStatus, healthScore, diagnostics, timestamp } = deviceData;

    if (this.isNativePgConnected) {
      const query = `
        INSERT INTO devices (id, hostname, model, serial_number, os_version, health_status, health_score, last_seen, specs)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (id) DO UPDATE SET
          hostname = EXCLUDED.hostname,
          model = EXCLUDED.model,
          health_status = EXCLUDED.health_status,
          health_score = EXCLUDED.health_score,
          last_seen = EXCLUDED.last_seen,
          specs = EXCLUDED.specs;
      `;
      await this.pool.query(query, [deviceId, hostname, model, serialNumber, osVersion, healthStatus, healthScore, timestamp, JSON.stringify(diagnostics)]);
    } else {
      this.inMemoryStore.devices.set(deviceId, {
        id: deviceId,
        hostname,
        model,
        serial_number: serialNumber,
        os_version: osVersion,
        health_status: healthStatus,
        health_score: healthScore,
        last_seen: timestamp,
        specs: diagnostics
      });
    }
  }

  async getDevices() {
    if (this.isNativePgConnected) {
      const res = await this.pool.query('SELECT * FROM devices ORDER BY last_seen DESC');
      return res.rows;
    } else {
      return Array.from(this.inMemoryStore.devices.values());
    }
  }

  async getDeviceById(id) {
    if (this.isNativePgConnected) {
      const res = await this.pool.query('SELECT * FROM devices WHERE id = $1', [id]);
      return res.rows[0] || null;
    } else {
      return this.inMemoryStore.devices.get(id) || null;
    }
  }

  // Telemetry History
  async recordTelemetry(data) {
    const { deviceId, cpuLoad, cpuTemp, ramUsedPercent, storageFreePercent, storageSmartStatus, batteryHealthPercent, diagnostics, timestamp } = data;

    if (this.isNativePgConnected) {
      const query = `
        INSERT INTO telemetry_history (device_id, cpu_load, cpu_temp, ram_used_percent, storage_free_percent, storage_smart_status, battery_health_percent, metrics, recorded_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);
      `;
      await this.pool.query(query, [deviceId, cpuLoad, cpuTemp, ramUsedPercent, storageFreePercent, storageSmartStatus, batteryHealthPercent, JSON.stringify(diagnostics), timestamp]);
    } else {
      this.inMemoryStore.telemetry.push({
        device_id: deviceId,
        cpu_load: cpuLoad,
        cpu_temp: cpuTemp,
        ram_used_percent: ramUsedPercent,
        storage_free_percent: storageFreePercent,
        storage_smart_status: storageSmartStatus,
        battery_health_percent: batteryHealthPercent,
        metrics: diagnostics,
        recorded_at: timestamp
      });
    }
  }

  // Alerts
  async recordAlerts(deviceId, alerts, timestamp) {
    if (!alerts || alerts.length === 0) return;

    for (const alert of alerts) {
      if (this.isNativePgConnected) {
        const query = `
          INSERT INTO alerts (device_id, alert_type, severity, title, message, status, created_at)
          VALUES ($1, $2, $3, $4, $5, 'ACTIVE', $6);
        `;
        await this.pool.query(query, [deviceId, alert.type, alert.severity, alert.title, alert.message, timestamp]);
      } else {
        this.inMemoryStore.alerts.unshift({
          id: this.inMemoryStore.alerts.length + 1,
          device_id: deviceId,
          alert_type: alert.type,
          severity: alert.severity,
          title: alert.title,
          message: alert.message,
          status: 'ACTIVE',
          created_at: timestamp
        });
      }
    }
  }

  async getActiveAlerts() {
    if (this.isNativePgConnected) {
      const res = await this.pool.query("SELECT * FROM alerts WHERE status = 'ACTIVE' ORDER BY created_at DESC");
      return res.rows;
    } else {
      return this.inMemoryStore.alerts.filter(a => a.status === 'ACTIVE');
    }
  }

  // Tickets
  async createTicket(ticketData) {
    const { ticketId, deviceId, customerName, customerEmail, issueDescription, priority, diagnosticSnapshot, timestamp } = ticketData;

    if (this.isNativePgConnected) {
      const query = `
        INSERT INTO tickets (id, device_id, customer_name, customer_email, issue_description, priority, diagnostic_snapshot, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'OPEN', $8, $8);
      `;
      await this.pool.query(query, [ticketId, deviceId, customerName, customerEmail, issueDescription, priority, JSON.stringify(diagnosticSnapshot), timestamp]);
    } else {
      const ticketObj = {
        id: ticketId,
        device_id: deviceId,
        customer_name: customerName,
        customer_email: customerEmail,
        issue_description: issueDescription,
        priority,
        diagnostic_snapshot: diagnosticSnapshot,
        status: 'OPEN',
        created_at: timestamp,
        updated_at: timestamp
      };
      this.inMemoryStore.tickets.set(ticketId, ticketObj);
    }
  }

  async getTickets() {
    if (this.isNativePgConnected) {
      const res = await this.pool.query('SELECT * FROM tickets ORDER BY created_at DESC');
      return res.rows;
    } else {
      return Array.from(this.inMemoryStore.tickets.values());
    }
  }

  async updateTicketStatus(id, newStatus) {
    const now = new Date().toISOString();
    if (this.isNativePgConnected) {
      await this.pool.query('UPDATE tickets SET status = $1, updated_at = $2 WHERE id = $3', [newStatus, now, id]);
    } else {
      const ticket = this.inMemoryStore.tickets.get(id);
      if (ticket) {
        ticket.status = newStatus;
        ticket.updated_at = now;
      }
    }
  }
}

module.exports = new PostgreSQLDatabase();
