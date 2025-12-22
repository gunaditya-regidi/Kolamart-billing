#!/usr/bin/env node
// Simple tester for the Google Apps Script exec URL used by the app.
// Usage: copy .env.local.example -> .env.local, set NEXT_PUBLIC_SHEET_SCRIPT_URL, then run:
//   node scripts/test-script-url.js

const fs = require('fs');
const path = require('path');

function loadLocalEnv(filePath) {
  try {
    const txt = fs.readFileSync(filePath, 'utf8');
    const lines = txt.split(/\r?\n/);
    const out = {};
    for (const l of lines) {
      const line = l.trim();
      if (!line || line.startsWith('#')) continue;
      const idx = line.indexOf('=');
      if (idx === -1) continue;
      const k = line.slice(0, idx).trim();
      let v = line.slice(idx + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      out[k] = v;
    }
    return out;
  } catch (e) {
    return {};
  }
}

const env = loadLocalEnv(path.resolve(process.cwd(), '.env.local'));
const url = process.env.NEXT_PUBLIC_SHEET_SCRIPT_URL || env.NEXT_PUBLIC_SHEET_SCRIPT_URL;

if (!url || url === 'REPLACE_WITH_YOUR_SCRIPT_EXEC_URL') {
  console.error('Missing NEXT_PUBLIC_SHEET_SCRIPT_URL. Copy .env.local.example -> .env.local and set the exec URL.');
  process.exit(1);
}

(async () => {
  try {
    const payload = { action: 'submitOrder', payload: { workerId: 'dev', customerName: 'Tester', phone: '000' } };
    console.log('POSTing test payload to', url);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    console.log('Status:', res.status);
    try {
      console.log('JSON response:', JSON.parse(text));
    } catch (e) {
      console.log('Text response (non-JSON):');
      console.log(text.slice(0, 2000));
    }
  } catch (err) {
    console.error('Request failed:', err && err.message ? err.message : err);
    process.exit(1);
  }
})();
