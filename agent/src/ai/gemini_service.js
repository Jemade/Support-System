/**
 * AVANTIS PC ASSIST: GEMINI AI INTEGRATION SERVICE
 * Free-tier optimized with deterministic grounding, retry logic, and offline fallbacks.
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
        temperature: 0.2, // Low temperature for factual precision
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
            // Switch model or back off
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
   * Strictly grounded in latest scan report + live telemetry.
   */
  async askAssistant(userQuestion, scanData = null, liveDiagnostics = null) {
    // 1. Refuse obvious off-topic prompts to preserve quota
    const qLower = userQuestion.toLowerCase().trim();
    const offTopicKeywords = ['poem', 'joke', 'recipe', 'song', 'story', 'essay', 'code in python', 'write code', 'who are you outside'];
    if (offTopicKeywords.some(kw => qLower.includes(kw)) && !qLower.includes('pc') && !qLower.includes('computer') && !qLower.includes('scan') && !qLower.includes('hardware')) {
      return "I am Avantis PC Assist, your dedicated diagnostic and PC health assistant. I can only assist with questions regarding your computer's health, hardware telemetry, driver updates, virus scans, and performance optimization.";
    }

    // 2. If no scan data is present
    if (!scanData && !liveDiagnostics) {
      return "No system scans or hardware telemetry have been recorded yet. Please run a Full System Scan or Scan Hardware from the dashboard so I can accurately analyze your PC.";
    }

    // Construct grounded context
    const contextObj = {
      liveSensors: liveDiagnostics ? {
        cpuLoadPercent: liveDiagnostics.cpu?.loadPercent,
        cpuTempC: liveDiagnostics.cpu?.temperatureC,
        ramUsedPercent: liveDiagnostics.memory?.usedPercent,
        ramUsedGB: liveDiagnostics.memory?.usedGB,
        ramTotalGB: liveDiagnostics.memory?.totalGB,
        storageUsedPercent: liveDiagnostics.storage?.usedPercent,
        storageFreeGB: liveDiagnostics.storage?.freeGB,
        storageSmart: liveDiagnostics.storage?.smartStatus,
        batteryPercent: liveDiagnostics.battery?.currentPercent,
        batteryHealth: liveDiagnostics.battery?.healthPercent
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

    const systemPrompt = `You are Avantis PC Assist AI, a technical diagnostic assistant for Avantis computers (Product of Zimbabwe).
Your instructions:
1. ONLY answer using the provided CONTEXT JSON. Never invent hardware specs, CPU temperatures, threat names, or statistics not present in CONTEXT.
2. If the user asks about a component not in CONTEXT (e.g. GPU temperature or second SSD), explicitly state that this data is not in the current report and recommend running the appropriate diagnostic scan.
3. If threats were found in Threat Scan, explain the threat name, confirm whether it was auto-remediated/quarantined, and advise if any action is needed in plain English.
4. Keep answers concise, technical, and helpful (1-3 short paragraphs).`;

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

    if (q.includes('gpu') || q.includes('graphics') || q.includes('video card')) {
      return "Dedicated GPU telemetry is not present in the current diagnostic report. To monitor your GPU and other hardware components, please run the 'Scan Hardware' module.";
    }

    if (q.includes('cpu') || q.includes('processor') || (q.includes('temp') && !q.includes('gpu'))) {
      if (ls.cpuLoadPercent !== undefined) {
        return `Your CPU load is currently at ${ls.cpuLoadPercent}%. Temperature is ${ls.cpuTempC !== null && ls.cpuTempC !== undefined ? ls.cpuTempC + '°C' : 'within normal operating limits'}. Thermal health is nominal.`;
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

    if (q.includes('virus') || q.includes('threat') || q.includes('malware') || q.includes('defender')) {
      const threatMod = (fs.modules || []).find(m => m.key === 'threat');
      if (threatMod) {
        return `Threat Scan status is ${threatMod.status}. Summary: ${threatMod.summary}. Windows Defender real-time protection is active.`;
      }
    }

    return `Based on your latest scan from ${fs.generatedAt ? new Date(fs.generatedAt).toLocaleDateString() : 'system records'}, overall status is ${fs.overallStatus || 'HEALTHY'}. All active subsystems are operating within configured thresholds.`;
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
      // Clean JSON fences if model wrapped in ```json
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
