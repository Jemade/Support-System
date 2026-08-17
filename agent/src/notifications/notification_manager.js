const path = require('path');
const { spawn } = require('child_process');

class NotificationManager {
  constructor(options = {}) {
    this.clientUiUrl = options.clientUiUrl || 'http://localhost:9142';
    
    // Severity weight lookup
    this.severityWeights = {
      'HEALTHY': 0,
      'WARNING': 1,
      'CRITICAL': 2
    };

    // Track last known state per hardware signal / component
    this.lastKnownSignals = {
      cpu: 'HEALTHY',
      memory: 'HEALTHY',
      storage: 'HEALTHY',
      battery: 'HEALTHY'
    };

    // History log of notifications sent
    this.notificationHistory = [];
  }

  getSeverityWeight(severity) {
    return this.severityWeights[severity] || 0;
  }

  /**
   * Process diagnostics and evaluation alerts.
   * Compares against last known state per signal, firing native notifications
   * on new issues or severity escalations only. Resets state on resolution.
   */
  processEvaluation(diagnostics, evaluation) {
    if (!diagnostics || !evaluation) return [];

    const alerts = evaluation.alerts || [];
    const notificationsFired = [];

    // Map alerts to components
    const componentAlerts = {
      cpu: alerts.filter(a => a.type && a.type.startsWith('CPU_')),
      memory: alerts.filter(a => a.type && a.type.startsWith('MEMORY_')),
      storage: alerts.filter(a => a.type && (a.type.startsWith('SMART_') || a.type.startsWith('LOW_STORAGE_'))),
      battery: alerts.filter(a => a.type && a.type.startsWith('BATTERY_'))
    };

    for (const [component, compAlerts] of Object.entries(componentAlerts)) {
      // Determine current component severity
      let currentSeverity = 'HEALTHY';
      if (compAlerts.length > 0) {
        const hasCritical = compAlerts.some(a => a.severity === 'CRITICAL');
        currentSeverity = hasCritical ? 'CRITICAL' : 'WARNING';
      }

      const lastSeverity = this.lastKnownSignals[component] || 'HEALTHY';
      const currentWeight = this.getSeverityWeight(currentSeverity);
      const lastWeight = this.getSeverityWeight(lastSeverity);

      if (currentSeverity === 'HEALTHY') {
        if (lastSeverity !== 'HEALTHY') {
          console.log(`[NotificationManager] Signal resolved for [${component}]: ${lastSeverity} -> HEALTHY. Resetting tracked state.`);
          this.lastKnownSignals[component] = 'HEALTHY';
        }
        continue;
      }

      // Check if we should notify:
      // 1. Brand new issue (was HEALTHY)
      // 2. Escalation in severity (e.g. WARNING -> CRITICAL)
      const isNewIssue = lastSeverity === 'HEALTHY';
      const isEscalation = currentWeight > lastWeight;

      if (isNewIssue || isEscalation) {
        const summary = this.buildNotificationSummary(component, currentSeverity, compAlerts, diagnostics);
        const reason = isNewIssue ? 'NEW_ISSUE' : 'SEVERITY_ESCALATION';
        
        console.log(`[NotificationManager] Firing native Windows notification for [${component}] (${reason}: ${lastSeverity} -> ${currentSeverity})`);
        
        this.sendWindowsToast(summary);
        
        notificationsFired.push({
          component,
          severity: currentSeverity,
          previousSeverity: lastSeverity,
          reason,
          title: summary.title,
          message: summary.message,
          timestamp: new Date().toISOString()
        });

        this.lastKnownSignals[component] = currentSeverity;
      } else {
        // Same severity or de-escalation: update tracked state quietly without spamming
        this.lastKnownSignals[component] = currentSeverity;
      }
    }

    return notificationsFired;
  }

  /**
   * Builds clean, plain-English notification copy and deep link URLs
   */
  buildNotificationSummary(component, severity, alerts, diagnostics) {
    const componentParam = component === 'battery' ? 'power' : component;
    const launchUrl = `${this.clientUiUrl}/#troubleshoot?component=${componentParam}`;

    if (alerts && alerts.length > 0) {
      const topAlert = alerts[0];
      const precautionNote = (topAlert.precautions && topAlert.precautions.length > 0)
        ? ` ${topAlert.precautions[0]}`
        : '';

      return {
        title: topAlert.title || `Avantis Support: ${component.toUpperCase()} Alert`,
        message: `${topAlert.message}${precautionNote}`,
        launchUrl,
        component,
        severity: topAlert.severity || severity
      };
    }

    const isCrit = severity === 'CRITICAL';
    return {
      title: isCrit ? `Avantis Support: Critical ${component.toUpperCase()} Alert` : `Avantis Support: ${component.toUpperCase()} Warning`,
      message: `A ${severity.toLowerCase()} condition was detected on your ${component} subsystem. Open Avantis Support to inspect details.`,
      launchUrl,
      component,
      severity
    };
  }

  /**
   * Dispatches a native Windows 10/11 Action Center toast notification
   * from the bottom-right corner using send_toast.ps1
   */
  sendWindowsToast({ title, message, launchUrl }) {
    this.notificationHistory.push({
      title,
      message,
      launchUrl,
      sentAt: new Date().toISOString()
    });

    if (process.platform !== 'win32') return;

    const scriptPath = path.join(__dirname, 'send_toast.ps1');
    const safeTitle = title || 'Hardware Health Notification';
    const safeMessage = message || '';
    const safeUrl = launchUrl || this.clientUiUrl;

    try {
      const psProcess = spawn('powershell.exe', [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        scriptPath,
        '-AppTitle',
        'Avantis Support',
        '-Title',
        safeTitle,
        '-Message',
        safeMessage,
        '-Url',
        safeUrl
      ], {
        windowsHide: true,
        detached: true,
        stdio: 'ignore'
      });
      psProcess.unref();
    } catch (err) {
      console.error('[NotificationManager] Failed to launch PowerShell toast process:', err.message);
    }
  }

  /**
   * Reset tracking state
   */
  resetState() {
    this.lastKnownSignals = {
      cpu: 'HEALTHY',
      memory: 'HEALTHY',
      storage: 'HEALTHY',
      battery: 'HEALTHY'
    };
  }

  getStatus() {
    return {
      trackedSignals: this.lastKnownSignals,
      historyCount: this.notificationHistory.length,
      recentNotifications: this.notificationHistory.slice(-5)
    };
  }
}

module.exports = NotificationManager;
