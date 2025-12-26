import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const SCRIPT_URL = process.env.NEXT_PUBLIC_SHEET_SCRIPT_URL_BILL;
  if (!SCRIPT_URL) {
    console.error('submit-bill: NEXT_PUBLIC_SHEET_SCRIPT_URL_BILL is not set');
    return NextResponse.json(
      { success: false, error: 'Missing NEXT_PUBLIC_SHEET_SCRIPT_URL_BILL environment variable on the server.' },
      { status: 500 }
    );
  }

  if (SCRIPT_URL.includes('/edit') || SCRIPT_URL.includes('/u/0/home/projects')) {
    console.warn('submit-bill: rejected script URL looks like editor URL:', SCRIPT_URL);
    const baseError = 'Script URL appears to be the Apps Script editor URL. Set NEXT_PUBLIC_SHEET_SCRIPT_URL_BILL to the deployed web app URL (the "web app" exec URL), not the editor /edit URL.';
    if (process.env.NODE_ENV !== 'production') {
      return NextResponse.json(
        { success: false, error: baseError, debug: { scriptUrl: SCRIPT_URL, envFound: !!process.env.NEXT_PUBLIC_SHEET_SCRIPT_URL_BILL } },
        { status: 400 }
      );
    }
    return NextResponse.json({ success: false, error: baseError }, { status: 400 });
  }

  try {
    const body = await req.json();
    const forwardBody = body && body.payload ? body.payload : body;
    console.info('submit-bill: forwarding payload to Apps Script:', forwardBody);

    const res = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(forwardBody),
    });

    const text = await res.text();
    try {
      const json = JSON.parse(text);
      return NextResponse.json(json, { status: res.status });
    } catch {
      return new NextResponse(text, { status: res.status, headers: { 'Content-Type': res.headers.get('content-type') || 'text/plain' } });
    }
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || String(err) }, { status: 500 });
  }
}
