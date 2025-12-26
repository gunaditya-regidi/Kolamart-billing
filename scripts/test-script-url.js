#!/usr/bin/env node
// Simple tester for the Google Apps Script exec URL used by the app.
// Usage: copy .env.local.example -> .env.local, set NEXT_PUBLIC_SHEET_SCRIPT_URL and NEXT_PUBLIC_SHEET_SCRIPT_URL_BILL, then run:
//   node scripts/test-script-url.js

import fs from 'fs';
import path from 'path';

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
// Test both order and bill script URLs
const orderUrl = process.env.NEXT_PUBLIC_SHEET_SCRIPT_URL || env.NEXT_PUBLIC_SHEET_SCRIPT_URL;
const billUrl = process.env.NEXT_PUBLIC_SHEET_SCRIPT_URL_BILL || env.NEXT_PUBLIC_SHEET_SCRIPT_URL_BILL;

if (!orderUrl || orderUrl === 'REPLACE_WITH_YOUR_ORDER_SCRIPT_EXEC_URL') {
  console.error('Missing NEXT_PUBLIC_SHEET_SCRIPT_URL. Copy .env.local -> .env.local and set the exec URL.');
  process.exit(1);
}

if (!billUrl || billUrl === 'REPLACE_WITH_YOUR_BILL_SCRIPT_EXEC_URL') {
  console.error('Missing NEXT_PUBLIC_SHEET_SCRIPT_URL_BILL. Copy .env.local -> .env.local and set the exec URL.');
  process.exit(1);
}

async function testUrl(url, type) {
  try {
    let payload;
    if (type === 'order') {
      payload = { action: 'submitOrder', payload: { workerId: 'dev', customerName: 'Tester', phone: '000' } };
    } else {
      payload = { action: 'submitBill', payload: { workerId: 'dev', customerName: 'Tester', phone: '000' } };
    }
    
    console.log(`POSTing ${type} test payload to`, url);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    console.log(`${type.charAt(0).toUpperCase() + type.slice(1)} Status:`, res.status);
    try {
      console.log(`${type.charAt(0).toUpperCase() + type.slice(1)} Response:`, JSON.parse(text));
    } catch (e) {
      console.log(`${type.charAt(0).toUpperCase() + type.slice(1)} Response (non-JSON):`);
      console.log(text.slice(0, 2000));
    }
    console.log('---');
    return res.status;
  } catch (err) {
    console.error(`Request failed for ${type}:`, err && err.message ? err.message : err);
    return null;
  }
}

(async () => {
  console.log('Testing order script URL...');
  await testUrl(orderUrl, 'order');
  
  console.log('\nTesting bill script URL...');
  await testUrl(billUrl, 'bill');
})();
