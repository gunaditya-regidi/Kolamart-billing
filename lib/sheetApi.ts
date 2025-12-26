const INTERNAL_ORDER_API = '/api/submit-order';
const INTERNAL_BILL_API = '/api/submit-bill';

export async function submitOrder(payload: any) {
  try {
    const res = await fetch(INTERNAL_ORDER_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'submitOrder', payload }),
    });

    if (!res.ok) {
      let text = '';
      try {
        text = await res.text();
      } catch {}
      throw new Error(`Request failed: ${res.status} ${res.statusText} ${text}`);
    }

    return res.json();
  } catch (err: any) {
    throw new Error(err?.message || 'Network request failed');
  }
}

export async function submitBill(payload: any) {
  try {
    const res = await fetch(INTERNAL_BILL_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'submitBill', payload }),
    });

    if (!res.ok) {
      let text = '';
      try {
        text = await res.text();
      } catch {}
      throw new Error(`Bill submit failed: ${res.status} ${res.statusText} ${text}`);
    }

    return res.json();
  } catch (err: any) {
    throw new Error(err?.message || 'Network request failed');
  }
}
