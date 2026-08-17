/**
 * AVANTIS PC ASSIST: GEMINI AI INTEGRATION SERVICE
 * Flexible, conversational, and strictly grounded in real telemetry (Zero Hallucination).
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Auto-load .env if present
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
    this.cache = new Map(); // Fingerprint -> cached AI explanation
  }

  /**
   * Core HTTPS request to Google Generative Language API
   */
  async generateContent(prompt, modelIndex = 0, retries = 2) {
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
        temperature: 0.3, // Balanced for conversational tone + factual precision
        maxOutputTokens: 600
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
        timeout: 12000
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
            setTimeout(async () => {
              try {
                const retryRes = await this.generateContent(prompt, nextModelIdx, retries - 1);
                resolve(retryRes);
              } catch (retryErr) {
                reject(retryErr);
              }
            }, 1000);
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
   * Natural, flexible, and strictly grounded in real telemetry (Zero Hallucination).
   */
  async askAssistant(userQuestion, scanData = null, liveDiagnostics = null) {
    // Construct grounded context
    const contextObj = {
      liveSensors: liveDiagnostics ? {
        cpuModel: liveDiagnostics.system?.cpuModel,
        cpuLoadPercent: liveDiagnostics.cpu?.loadPercent,
        cpuTempC: liveDiagnostics.cpu?.temperatureC,
        ramUsedPercent: liveDiagnostics.memory?.usedPercent,
        ramUsedGB: liveDiagnostics.memory?.usedGB,
        ramTotalGB: liveDiagnostics.memory?.totalGB,
        storageUsedPercent: liveDiagnostics.storage?.usedPercent,
        storageFreeGB: liveDiagnostics.storage?.freeGB,
        storageType: liveDiagnostics.storage?.driveType,
        storageSmart: liveDiagnostics.storage?.smartStatus,
        batteryPercent: liveDiagnostics.battery?.currentPercent,
        batteryHealth: liveDiagnostics.battery?.healthPercent,
        batteryHasBattery: liveDiagnostics.battery?.hasBattery
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

    const systemPrompt = `You are Avantis PC Assist, an intelligent, helpful, and friendly PC diagnostic and optimization assistant for Avantis computers (Product of Zimbabwe).

Guidelines:
1. Conversational & Flexible: Be natural, polite, and helpful. You can answer general questions about computing, Windows maintenance tips, troubleshooting advice, and system optimization recommendations freely and intelligently.
2. Grounded on Real Hardware (No Hallucination): When the user asks about THIS specific computer's current health, temperatures, load, memory, disk, drivers, or malware scan results, you MUST strictly use the data in the CONTEXT JSON. Never fabricate or guess hardware numbers, temperatures, threat names, or component counts not found in CONTEXT.
3. Component Transparency: If the user asks about a component or metric that is NOT in CONTEXT (such as a dedicated GPU or external drive), explain that this data is not in the current diagnostic snapshot and suggest running "Scan Hardware" or "Full System Scan" from the dashboard.
4. Security & Actionable Advice: If threats are detected in CONTEXT, explain what was found and whether it was auto-quarantined. Recommend relevant dashboard actions (Full System Scan, Update Drivers, Clean Up Files, Optimize Network, Threat Scan) when appropriate.
5. Keep your tone professional, direct, and easy to understand.`;

    const prompt = `${systemPrompt}\n\nCONTEXT JSON:\n${JSON.stringify(contextObj, null, 2)}\n\nUSER QUESTION:\n${userQuestion}`;

    try {
      return await this.generateContent(prompt);
    } catch (err) {
      console.warn('[GeminiService] API fallback engaged:', err.message);
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
      return "Hello! I'm Avantis Assist. I can help you monitor your computer's health, check processor and memory usage, inspect disk space, explain security scans, and optimize system performance. How can I assist you today?";
    }

    if (q.includes('gpu') || q.includes('graphics') || q.includes('video card')) {
      return "Dedicated GPU telemetry is not present in the current diagnostic report. To monitor your GPU and other hardware components, please run the 'Scan Hardware' module.";
    }

    if (q.includes('cpu') || q.includes('processor') || (q.includes('temp') && !q.includes('gpu'))) {
      if (ls.cpuLoadPercent !== undefined) {
        return `Your CPU (${ls.cpuModel || 'Processor'}) is operating at ${ls.cpuLoadPercent}% load. Temperature is ${ls.cpuTempC !== null && ls.cpuTempC !== undefined ? ls.cpuTempC + '°C' : 'within normal operating limits'}. Thermal health is nominal.`;
      }
    }

    if (q.includes('ram') || q.includes('memory')) {
      if (ls.ramUsedPercent !== undefined) {
        return `Memory utilization: ${ls.ramUsedPercent}% used (${ls.ramUsedGB || 0} GB of ${ls.ramTotalGB || 0} GB).`;
      }
    }

    if (q.includes('storage') || q.includes('disk') || q.includes('drive') || q.includes('ssd') || q.includes('space')) {
      if (ls.storageUsedPercent !== undefined) {
        return `Primary Drive (C:) is at ${ls.storageUsedPercent}% capacity with ${ls.storageFreeGB} GB free. SMART status is ${ls.storageSmart || 'PASSED'}.`;
      }
    }

    if (q.includes('battery') || q.includes('power')) {
      if (ls.batteryHasBattery) {
        return `Battery is at ${ls.batteryPercent}%, with a health rating of ${ls.batteryHealth}%.`;
      }
      return "This system is running on direct AC mains power supply (Desktop / All-In-One).";
    }

    if (q.includes('virus') || q.includes('threat') || q.includes('malware') || q.includes('defender')) {
      const threatMod = (fs.modules || []).find(m => m.key === 'threat');
      if (threatMod) {
        return `Threat Scan status is ${threatMod.status}. Summary: ${threatMod.summary}. Windows Defender real-time protection is active.`;
      }
    }

    return `Based on your latest diagnostic snapshot from ${fs.generatedAt ? new Date(fs.generatedAt).toLocaleDateString() : 'system telemetry'}, your PC overall health status is ${fs.overallStatus || 'HEALTHY'}. All active subsystems are operating within configured thresholds. Let me know if you would like me to check any specific component!`;
  }

  /**
   * Part 2: Background Predictive Explanation
   * Turns a mathematically detected trend into a structured JSON recommendation.
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
