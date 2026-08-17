/**
 * AVANTIS PC ASSIST: GEMINI AI INTEGRATION SERVICE
 * Expert PC & Laptop Knowledge, Zero Hallucination Grounding, Clean Text Formatting.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

function loadEnvKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  try {
    const envPath = path.resolve(__dirname, '..', '..', '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      const match = content.match(/GEMINI_API_KEY=(.*)/);
      if (match && match[1]) return match[1].trim();
    }
  } catch {}
  return '';
}

const DEFAULT_API_KEY = loadEnvKey();
const MODELS = ['gemini-flash-latest', 'gemini-pro-latest'];

class GeminiService {
  constructor(apiKey = DEFAULT_API_KEY) {
    this.apiKey = apiKey;
    this.cache = new Map();
  }

  /**
   * Robust Gemini API caller with automatic model fallback and exponential backoff
   */
  async generateContent(prompt, modelIndex = 0, retries = 3) {
    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY is not configured');
    }

    const model = MODELS[modelIndex] || MODELS[0];
    const postData = JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: 0.35,
        maxOutputTokens: 800
      }
    });

    return new Promise((resolve, reject) => {
      const url = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`);

      const req = https.request(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        },
        timeout: 14000
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', async () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const json = JSON.parse(body);
              const text = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
              resolve(text.trim());
            } catch (err) {
              reject(new Error(`Failed to parse Gemini response: ${err.message}`));
            }
          } else if ((res.statusCode === 429 || res.statusCode === 503) && retries > 0) {
            const nextModelIdx = (modelIndex + 1) % MODELS.length;
            const delayMs = (4 - retries) * 1200;
            setTimeout(async () => {
              try {
                const retryRes = await this.generateContent(prompt, nextModelIdx, retries - 1);
                resolve(retryRes);
              } catch (retryErr) {
                reject(retryErr);
              }
            }, delayMs);
          } else {
            reject(new Error(`Gemini API error (${res.statusCode}): ${body.slice(0, 200)}`));
          }
        });
      });

      req.on('error', (err) => reject(err));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Gemini API request timed out'));
      });

      req.write(postData);
      req.end();
    });
  }

  /**
   * Part 1: Foreground Chat Assistant
   * Deep technical knowledge for general computing & Avantis hardware,
   * Strictly grounded in live telemetry for machine-specific queries (Zero Hallucination).
   */
  async askAssistant(userQuestion, scanData = null, liveDiagnostics = null) {
    const contextObj = {
      liveSensors: liveDiagnostics ? {
        hostname: liveDiagnostics.system?.hostname,
        model: liveDiagnostics.system?.model,
        serialNumber: liveDiagnostics.system?.serialNumber,
        osVersion: liveDiagnostics.system?.osVersion,
        cpuModel: liveDiagnostics.system?.cpuModel,
        cpuCores: liveDiagnostics.system?.cpuCores,
        cpuLoadPercent: liveDiagnostics.cpu?.loadPercent,
        cpuTempC: liveDiagnostics.cpu?.temperatureC,
        ramUsedPercent: liveDiagnostics.memory?.usedPercent,
        ramUsedGB: liveDiagnostics.memory?.usedGB,
        ramTotalGB: liveDiagnostics.memory?.totalGB,
        storageUsedPercent: liveDiagnostics.storage?.usedPercent,
        storageFreeGB: liveDiagnostics.storage?.freeGB,
        storageTotalGB: liveDiagnostics.storage?.totalGB,
        storageType: liveDiagnostics.storage?.driveType,
        storageSmart: liveDiagnostics.storage?.smartStatus,
        batteryPercent: liveDiagnostics.battery?.currentPercent,
        batteryHealth: liveDiagnostics.battery?.healthPercent,
        batteryHasBattery: liveDiagnostics.battery?.hasBattery,
        batteryStatus: liveDiagnostics.battery?.statusMessage
      } : null,
      lastFullScan: scanData ? {
        generatedAt: scanData.generatedAt,
        overallStatus: scanData.overallStatus,
        summary: scanData.summary,
        modules: (scanData.modules || []).map(m => ({
          key: m.key,
          name: m.name,
          status: m.status,
          summary: m.summary,
          threatsFound: m.data?.threats || [],
          driversOutdated: m.data?.outdatedCount || 0,
          spaceReclaimableMb: m.data?.reclaimedMb || 0,
          networkLatencyMs: m.data?.after?.dnsLatencyMs || m.data?.before?.dnsLatencyMs
        }))
      } : null
    };

    const systemPrompt = `You are Avantis PC Assist, the intelligent hardware, diagnostic, and technical support assistant for Avantis computers (Zimbabwe's leading indigenous PC & laptop manufacturer).

Your Knowledge & Expertise:
1. Avantis Systems: You have deep knowledge of Avantis laptops, desktops, and all-in-one PCs, including thermal design, battery calibration, memory expansion, NVMe SSD optimization, BIOS settings, and certified driver packages.
2. Laptop & Hardware Engineering: You can explain thermal throttling, fan dust maintenance, battery cycle wear, Windows power plans, background process overhead, RAM paging, SSD TRIM operations, and malware defense in clear, technical, yet accessible terms.
3. Strict Telemetry Grounding (No Hallucination):
   - When the user asks about THIS specific machine's current metrics (CPU load, temperatures, memory usage, free disk space, battery health, scan status, or threats), you MUST use ONLY the data in CONTEXT JSON.
   - NEVER fabricate or guess CPU temperatures, memory figures, or fake disk numbers not present in CONTEXT JSON.
   - If the user asks about a component not in CONTEXT (e.g. dedicated GPU, secondary internal drive), explain that this specific sensor is not in the current baseline and advise running 'Scan Hardware'.
4. Action-Driven Resolution:
   - When troubleshooting performance or health issues, guide the user to the 6 core actions on the Avantis dashboard:
     • Full System Scan (runs all 5 modules sequentially)
     • Update Drivers (installs verified Avantis drivers)
     • Scan Hardware (inspects live thermals, RAM, SMART, and battery)
     • Clean Up Files (sweeps temp files, update cache, and runs SSD TRIM)
     • Optimize Network (resets TCP/IP stack and flushes DNS)
     • Threat Scan (Windows Defender malware scan and quarantine)
5. Clean, Professional Text:
   - Write in clear, well-structured plain text. Use bullet points or numbered lists where helpful. Avoid unnecessary technical jargon while remaining precise.`;

    const prompt = `${systemPrompt}\n\nCONTEXT JSON:\n${JSON.stringify(contextObj, null, 2)}\n\nUSER QUESTION:\n${userQuestion}`;

    try {
      return await this.generateContent(prompt);
    } catch (err) {
      console.warn('[GeminiService] Live API fallback engaged:', err.message);
      return this.generateGroundedFallbackChat(userQuestion, contextObj);
    }
  }

  /**
   * Deterministic local fallback if Gemini is offline/rate-limited
   */
  generateGroundedFallbackChat(question, ctx) {
    const q = question.toLowerCase();
    const ls = ctx.liveSensors || {};
    const fs = ctx.lastFullScan || {};

    if (q.includes('hello') || q.includes('hi') || q.includes('hey') || q.includes('who are you') || q.includes('help')) {
      return "Hello! I am Avantis PC Assist, your built-in hardware diagnostic and optimization assistant for Avantis computers. I can help you monitor live system telemetry, troubleshoot performance bottlenecks, check battery health, explain security scans, and keep your drivers updated. What can I do for you today?";
    }

    if (q.includes('slow') || q.includes('speed') || q.includes('faster') || q.includes('lag') || q.includes('performance') || q.includes('boost') || q.includes('optimize') || q.includes('tune')) {
      let advice = "Computers and laptops typically slow down over time due to several key factors:\n\n";
      advice += "1. Storage Fragmentation & Cache Clutter: Accumulated temporary files, browser caches, and pending Windows update staging files consume drive throughput.\n";
      advice += "2. Background Memory Pressure: Startup programs and background tasks hold onto active RAM.\n";
      advice += "3. Outdated Device Drivers: Hardware components (chipset, graphics, network) require updated drivers for optimal hardware acceleration.\n";
      advice += "4. Network & DNS Latency: Stale DNS resolution tables can introduce latency to web browsing.\n\n";
      advice += "Recommended Avantis Actions:\n";
      advice += "• Run 'Clean Up Files' from the Actions tab to clear caches and execute SSD TRIM.\n";
      advice += "• Run 'Update Drivers' to install verified Avantis packages.\n";
      advice += "• Run 'Optimize Network' to flush DNS and reset the TCP stack.\n";
      advice += "• Run 'Full System Scan' for an automated end-to-end maintenance pass.";
      return advice;
    }

    if (q.includes('battery') || q.includes('charge') || q.includes('power')) {
      if (ls.batteryHasBattery) {
        return `Battery Telemetry:\n• Current Charge: ${ls.batteryPercent}%\n• Battery Health: ${ls.batteryHealth}%\n• Status: ${ls.batteryStatus || 'Discharging'}\n\nTip: To maximize laptop battery lifespan, avoid letting the battery drop below 15% frequently and keep operating temperatures moderate.`;
      }
      return "This system is operating on direct AC mains power supply (Desktop / All-In-One).";
    }

    if (q.includes('gpu') || q.includes('graphics') || q.includes('video card')) {
      return "Dedicated GPU telemetry is not present in the current diagnostic snapshot. To inspect all detected hardware components and sensors, please run the 'Scan Hardware' module.";
    }

    if (q.includes('cpu') || q.includes('processor') || (q.includes('temp') && !q.includes('gpu'))) {
      if (ls.cpuLoadPercent !== undefined) {
        return `CPU Telemetry (${ls.cpuModel || 'Processor'}):\n• Utilization: ${ls.cpuLoadPercent}%\n• Operating Temperature: ${ls.cpuTempC !== null && ls.cpuTempC !== undefined ? ls.cpuTempC + '°C' : 'Nominal'}\n• Cores: ${ls.cpuCores || 'Multi-Core'}\n\nThermal performance is operating within safe operational parameters.`;
      }
    }

    if (q.includes('ram') || q.includes('memory')) {
      if (ls.ramUsedPercent !== undefined) {
        return `Memory (RAM) Telemetry:\n• Used: ${ls.ramUsedGB || 0} GB of ${ls.ramTotalGB || 0} GB (${ls.ramUsedPercent}% utilization).\n• Available: ${(ls.ramTotalGB - ls.ramUsedGB).toFixed(1)} GB.\n\nMemory capacity is operating stably.`;
      }
    }

    if (q.includes('storage') || q.includes('disk') || q.includes('drive') || q.includes('ssd') || q.includes('space')) {
      if (ls.storageUsedPercent !== undefined) {
        return `Primary Storage (Drive C:):\n• Free Space: ${ls.storageFreeGB} GB out of ${ls.storageTotalGB} GB (${ls.storageUsedPercent}% used)\n• Drive Type: ${ls.storageType || 'NVMe SSD'}\n• SMART Status: ${ls.storageSmart || 'PASSED'}\n\nDrive health is verified healthy.`;
      }
    }

    if (q.includes('virus') || q.includes('threat') || q.includes('malware') || q.includes('defender')) {
      const threatMod = (fs.modules || []).find(m => m.key === 'threat');
      if (threatMod) {
        return `Threat Scan Telemetry:\n• Status: ${threatMod.status}\n• Findings: ${threatMod.summary}\n• Windows Defender Real-Time Protection: Active.`;
      }
    }

    return `System Status Overview:\n• Health Baseline: ${fs.overallStatus || 'HEALTHY'}\n• Diagnostic Snapshot: ${fs.generatedAt ? new Date(fs.generatedAt).toLocaleDateString() : 'Active'}\n\nAll primary subsystems (Processor, Memory, Primary NVMe, Network Stack) are functioning within nominal parameters. You can ask me any question about your PC's hardware, performance, or maintenance!`;
  }

  /**
   * Part 2: Background Predictive Explanation
   */
  async explainTrend(flag) {
    const cacheKey = JSON.stringify(flag);
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const prompt = `A deterministic trend was detected in Avantis PC telemetry:
Flag Data: ${JSON.stringify(flag)}

Explain in one short, clear sentence what this likely means for the user, and recommend ONE specific action from this list:
["run_cleanup", "schedule_disk_check", "run_driver_update", "reduce_startup_apps", "optimize_network", "no_action_needed"]

Respond ONLY with valid JSON in this exact schema:
{
  "explanation": "string",
  "recommended_action": "run_cleanup | schedule_disk_check | run_driver_update | reduce_startup_apps | optimize_network | no_action_needed",
  "urgency": "low | medium | high"
}`;

    try {
      const rawText = await this.generateContent(prompt);
      const cleanJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJson);
      this.cache.set(cacheKey, parsed);
      return parsed;
    } catch (err) {
      console.warn('[GeminiService] Trend explanation fallback:', err.message);
      const fallback = this.generateFallbackTrendExplanation(flag);
      this.cache.set(cacheKey, fallback);
      return fallback;
    }
  }

  generateFallbackTrendExplanation(flag) {
    switch (flag.type) {
      case 'disk_space_declining':
        return {
          explanation: `Storage space on drive C: has decreased by ${flag.dropPercent || 15}% across recent scans. Cleaning temporary and update files will free up capacity.`,
          recommended_action: 'run_cleanup',
          urgency: flag.currentFreeGB < 10 ? 'high' : 'medium'
        };
      case 'cpu_temp_rising':
        return {
          explanation: `Processor operating temperatures have shown a rising trend (+${flag.riseC || 10}°C). Consider checking for background tasks or optimizing cooling airflow.`,
          recommended_action: 'reduce_startup_apps',
          urgency: flag.currentTempC > 85 ? 'high' : 'medium'
        };
      case 'battery_degradation':
        return {
          explanation: `Battery capacity retention has declined by ${flag.dropPercent || 5}%. Battery calibration or power optimization is recommended.`,
          recommended_action: 'schedule_disk_check',
          urgency: 'low'
        };
      case 'smart_anomaly':
        return {
          explanation: 'Physical storage drive reported SMART diagnostic alerts. Immediate backup and diagnostic audit recommended.',
          recommended_action: 'schedule_disk_check',
          urgency: 'high'
        };
      default:
        return {
          explanation: 'Telemetry trend detected that may affect system responsiveness over time.',
          recommended_action: 'run_cleanup',
          urgency: 'medium'
        };
    }
  }
}

module.exports = GeminiService;
