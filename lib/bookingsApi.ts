// Primary Apps Script URL (client-side attempt). Provided by user.
const APPS_SCRIPT_URL = 'https://script.google.com/macros/library/d/10lgahDEzhPDtCM-G8JmkILAOqyo_beC3a3CfVTBh4rpzv3o1JcmEFtDc/1';

async function postJson(url: string, payload: any, opts: RequestInit = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(payload),
    ...opts,
  });
  return res;
}

export async function submitBookingToAppsScript(payload: any) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await postJson(APPS_SCRIPT_URL, payload, { mode: 'cors', cache: 'no-store', signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const errMsg = `Apps Script request failed: ${res.status} ${res.statusText} ${text}`;
      console.error(errMsg);
      // Try fallback to local API
      try {
        const fallback = await postJson('/api/submit-order', payload, { cache: 'no-store' });
        if (!fallback.ok) {
          const fbText = await fallback.text().catch(() => '');
          const msg = `Both Apps Script and local fallback failed: ${errMsg}; fallback: ${fallback.status} ${fallback.statusText} ${fbText}`;
          console.error(msg);
          return { success: false, error: msg } as any;
        }
        const data = await fallback.json().catch(() => null);
        return data;
      } catch (fbErr: any) {
        const msg = fbErr?.message || errMsg || 'Booking submission failed';
        console.error(msg);
        return { success: false, error: msg } as any;
      }
    }

    const data = await res.json().catch(() => null);
    if (!data) throw new Error('Apps Script returned invalid JSON');
    return data;
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      console.error('Apps Script request timed out');
      // try local fallback on timeout
      try {
        const fallback = await postJson('/api/submit-order', payload, { cache: 'no-store' });
        if (!fallback.ok) {
          const fbText = await fallback.text().catch(() => '');
          const msg = `Timeout and fallback failed: ${fallback.status} ${fallback.statusText} ${fbText}`;
          console.error(msg);
          return { success: false, error: msg } as any;
        }
        const data = await fallback.json().catch(() => null);
        return data;
      } catch (fbErr: any) {
        const msg = fbErr?.message || 'Timeout and local fallback failed';
        console.error(msg);
        return { success: false, error: msg } as any;
      }
    }

    // Final fallback: attempt local API once more for network errors / auth redirects
    try {
      console.error('Apps Script request error, attempting local fallback:', err?.message || err);

      // Try a sequence of fallback endpoints to handle different dev / emulator contexts.
      const candidates = [
        '/api/submit-order',
      ];

      // If running in a browser, add origin-based endpoint
      try {
        if (typeof window !== 'undefined' && window.location && window.location.origin) {
          candidates.push(window.location.origin + '/api/submit-order');
        }
      } catch {}

      // Common emulator host for Android emulator -> host machine
      candidates.push('http://10.0.2.2:3000/api/submit-order');

      let lastErr: any = null;
      for (const url of candidates) {
        try {
          const fallback = await postJson(url, payload, { cache: 'no-store' });
          if (!fallback.ok) {
            const fbText = await fallback.text().catch(() => '');
            lastErr = `Fallback ${url} returned ${fallback.status} ${fallback.statusText} ${fbText}`;
            console.warn(lastErr);
            continue;
          }
          const data = await fallback.json().catch(() => null);
          return data;
        } catch (e: any) {
          lastErr = e;
          console.warn('Fallback POST failed for', url, e?.message || e);
          continue;
        }
      }

      const msg = lastErr?.message || String(lastErr) || 'All fallbacks failed';
      console.error('All local fallback attempts failed:', msg);
      return { success: false, error: msg } as any;
    } catch (fbErr: any) {
      const msg = fbErr?.message || err?.message || 'Failed to submit booking';
      console.error(msg);
      return { success: false, error: msg } as any;
    }
  } finally {
    clearTimeout(timeout);
  }
}
