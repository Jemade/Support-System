const https = require('https');
const fs = require('fs');
const path = require('path');

let API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  try {
    const envPath = path.resolve(__dirname, '..', 'agent', '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      const match = content.match(/GEMINI_API_KEY=(.*)/);
      if (match && match[1]) API_KEY = match[1].trim();
    }
  } catch {}
}

async function test(path) {
  return new Promise((resolve) => {
    const data = JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: 'Hello' }] }]
    });

    const url = new URL(`https://generativelanguage.googleapis.com${path}?key=${API_KEY}`);

    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      },
      timeout: 10000
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ path, status: res.statusCode, body: body.slice(0, 200) }));
    });
    req.on('error', (err) => resolve({ path, error: err.message }));
    req.write(data);
    req.end();
  });
}

async function run() {
  const tests = [
    '/v1beta/models/gemini-2.5-flash:generateContent',
    '/v1beta/models/gemini-flash-latest:generateContent',
    '/v1beta/models/gemini-2.5-flash-lite:generateContent',
    '/v1beta/models/gemini-pro-latest:generateContent',
    '/v1/models/gemini-2.5-flash:generateContent',
    '/v1/models/gemini-1.5-flash:generateContent',
    '/v1/models/gemini-flash-latest:generateContent'
  ];

  for (const t of tests) {
    const res = await test(t);
    console.log(`${res.path} -> ${res.status} | ${res.body || res.error}`);
  }
}

run();
