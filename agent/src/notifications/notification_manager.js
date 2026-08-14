const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

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
   * Builds user-friendly plain-English microcopy and deep link URLs
   */
  buildNotificationSummary(component, severity, alerts, diagnostics) {
    const componentParam = component === 'battery' ? 'power' : component;
    const launchUrl = `${this.clientUiUrl}/#troubleshoot?component=${componentParam}`;

    switch (component) {
      case 'cpu': {
        const temp = diagnostics.cpu ? diagnostics.cpu.temperatureC : 85;
        const load = diagnostics.cpu ? diagnostics.cpu.loadPercent : 90;
        const isCrit = severity === 'CRITICAL' || temp >= 95;
        return {
          title: isCrit ? 'Avantis Alert: CPU Overheating' : 'Avantis Warning: High CPU Temperature',
          message: isCrit
            ? `CPU temperature reached ${temp}°C (${load}% load). Thermal throttling is active — check system ventilation.`
            : `CPU temperature is elevated at ${temp}°C. Ensure air vents are unblocked and clear.`,
          launchUrl,
          component,
          severity
        };
      }

      case 'memory': {
        const mem = diagnostics.memory || { usedPercent: 95, usedGB: 15.2, totalGB: 16 };
        return {
          title: 'Avantis Alert: High Memory Consumption',
          message: `RAM usage reached ${mem.usedPercent}% (${mem.usedGB} GB of ${mem.totalGB} GB used). System performance may degrade.`,
          launchUrl,
          component,
          severity
        };
      }

      case 'storage': {
        const storage = diagnostics.storage || { smartStatus: 'PASSED', reallocatedSectors: 12, freePercent: 4, freeGB: 20, totalGB: 512 };
        if (storage.smartStatus === 'FAILING_NOW') {
          return {
            title: 'Avantis CRITICAL: Hard Drive SMART Failure',
            message: 'Primary drive C: is reporting imminent hardware failure. Immediate data backup recommended.',
            launchUrl,
            component,
            severity
          };
        }
        if (storage.reallocatedSectors > 0) {
          return {
            title: 'Avantis Warning: Storage Health Degrading',
            message: `Drive C: reported ${storage.reallocatedSectors} reallocated sectors. Drive health monitoring is active.`,
            launchUrl,
            component,
            severity
          };
        }
        return {
          title: 'Avantis Alert: Low Storage Space',
          message: `Primary drive C: has only ${storage.freePercent}% (${storage.freeGB} GB) free space remaining.`,
          launchUrl,
          component,
          severity
        };
      }

      case 'battery': {
        const bat = diagnostics.battery || { healthPercent: 58, currentPercent: 80 };
        const isCrit = severity === 'CRITICAL' || bat.healthPercent < 60;
        return {
          title: isCrit ? 'Avantis Alert: Battery Capacity Degraded' : 'Avantis Warning: Battery Health Wear',
          message: isCrit
            ? `Battery health has dropped to ${bat.healthPercent}% of original design capacity — consider a battery replacement.`
            : `Battery health is at ${bat.healthPercent}% — showing noticeable capacity wear.`,
          launchUrl,
          component,
          severity
        };
      }

      default:
        return {
          title: 'Avantis Hardware Support Alert',
          message: alerts[0] ? alerts[0].message : 'A hardware diagnostic alert requires your attention.',
          launchUrl,
          component,
          severity
        };
    }
  }

  /**
   * Dispatches a native Windows 10/11 Action Center toast notification
   * using PowerShell and Windows.UI.Notifications WinRT.
   */
  sendWindowsToast({ title, message, launchUrl }) {
    this.notificationHistory.push({
      title,
      message,
      launchUrl,
      sentAt: new Date().toISOString()
    });

    const safeTitle = (title || 'Avantis Hardware Support').replace(/['"]/g, '');
    const safeMessage = (message || '').replace(/['"]/g, '');
    const safeUrl = launchUrl || this.clientUiUrl;

    const psScript = `
try {
  [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
  [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null

  $xmlTemplate = @"
<toast activationType="protocol" launch="${safeUrl}">
  <visual>
    <binding template="ToastGeneric">
      <text>${safeTitle}</text>
      <text>${safeMessage}</text>
      <text placement="attribution">Avantis Hardware Support</text>
    </binding>
  </visual>
  <actions>
    <action content="Open Troubleshoot" activationType="protocol" arguments="${safeUrl}" />
  </actions>
</toast>
"@

  $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
  $xml.LoadXml($xmlTemplate)
  $toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
  
  # Use PowerShell standard AppID for reliable Action Center toast display on Windows 10 & 11
  $appId = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe'
  [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show($toast)
} catch {
  # Fallback to NotifyIcon balloon if WinRT toast is restricted in environment
  Add-Type -AssemblyName System.Windows.Forms
  $notify = New-Object System.Windows.Forms.NotifyIcon
  $notify.Icon = [System.Drawing.SystemIcons]::Warning
  $notify.BalloonTipTitle = "${safeTitle}"
  $notify.BalloonTipText = "${safeMessage}"
  $notify.Visible = $True
  $notify.ShowBalloonTip(5000)
}
`;

    try {
      const psProcess = spawn('powershell.exe', [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        psScript
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
   * Reset tracking state (useful for test resets or user manual reset)
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
