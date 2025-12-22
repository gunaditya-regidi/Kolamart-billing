export async function submitOrderToSheet(payload: any) {
  const SCRIPT_URL = process.env.NEXT_PUBLIC_SHEET_SCRIPT_URL;
  if (!SCRIPT_URL) throw new Error('NEXT_PUBLIC_SHEET_SCRIPT_URL is not set');

  const res = await fetch(SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'submitOrder',
      payload,
    }),
  });

  if (!res.ok) {
    throw new Error('Network error');
  }

  return res.json();
}
