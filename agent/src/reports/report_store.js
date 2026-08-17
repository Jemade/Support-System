const fs = require('fs');
const path = require('path');
const os = require('os');

class ReportStore {
  constructor(baseDir) {
    this.reportsDir = baseDir || path.resolve(__dirname, '..', '..', '..', 'reports');
    if (!fs.existsSync(this.reportsDir)) {
      try { fs.mkdirSync(this.reportsDir, { recursive: true }); } catch (_) {}
    }
    this.ensureReportsDir();
  }

  ensureReportsDir() {
    try {
      if (!fs.existsSync(this.reportsDir)) {
        fs.mkdirSync(this.reportsDir, { recursive: true });
      }
    } catch (err) {
      console.error('[ReportStore] Error creating reports directory:', err.message);
    }
  }

  saveReport(scanData) {
    this.ensureReportsDir();
    const hostname = (os.hostname() || 'DEVICE').replace(/[^a-zA-Z0-9_-]/g, '_');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${hostname}_${timestamp}.json`;
    const fullPath = path.join(this.reportsDir, filename);

    const reportPayload = {
      reportId: filename.replace('.json', ''),
      filename,
      hostname: os.hostname() || 'DEVICE',
      platform: process.platform,
      arch: os.arch(),
      generatedAt: new Date().toISOString(),
      overallStatus: scanData.overallStatus || 'PASS',
      summary: scanData.summary || {},
      modules: scanData.modules || [],
      metadata: {
        agentVersion: '2.4.0',
        engine: 'Avantis Assist Orchestrator',
        osRelease: os.release()
      }
    };

    try {
      fs.writeFileSync(fullPath, JSON.stringify(reportPayload, null, 2), 'utf8');
      console.log(`[ReportStore] Audit report successfully written: ${fullPath}`);
      return { success: true, filename, fullPath, report: reportPayload };
    } catch (err) {
      console.error('[ReportStore] Failed to write audit report:', err.message);
      return { success: false, error: err.message };
    }
  }

  listReports(limit = 50) {
    this.ensureReportsDir();
    try {
      const files = fs.readdirSync(this.reportsDir)
        .filter(f => f.endsWith('.json'))
        .sort((a, b) => b.localeCompare(a))
        .slice(0, limit);

      const summaries = [];
      for (const file of files) {
        try {
          const filePath = path.join(this.reportsDir, file);
          const raw = fs.readFileSync(filePath, 'utf8');
          const data = JSON.parse(raw);
          summaries.push({
            filename: file,
            generatedAt: data.generatedAt,
            hostname: data.hostname,
            overallStatus: data.overallStatus,
            summary: data.summary
          });
        } catch (_) {}
      }

      return summaries;
    } catch (err) {
      console.error('[ReportStore] Error listing reports:', err.message);
      return [];
    }
  }

  getReport(filename) {
    this.ensureReportsDir();
    const safeFilename = path.basename(filename);
    const fullPath = path.join(this.reportsDir, safeFilename);

    if (!fs.existsSync(fullPath)) {
      return null;
    }

    try {
      const raw = fs.readFileSync(fullPath, 'utf8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
}

module.exports = ReportStore;
