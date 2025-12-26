import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const SCRIPT_URL = process.env.NEXT_PUBLIC_SHEET_SCRIPT_URL;
  if (!SCRIPT_URL) {
    console.error('submit-order: NEXT_PUBLIC_SHEET_SCRIPT_URL is not set');
    return NextResponse.json(
      { success: false, error: 'Missing NEXT_PUBLIC_SHEET_SCRIPT_URL environment variable on the server.' },
      { status: 500 }
    );
  }

  // Quick validation: if the URL contains '/edit' or appears to be the Apps Script editor
  // it will return HTML (the editor page) instead of the deployed web app JSON. Give
  // a helpful error so users set the correct deployed web app URL in env.
  if (SCRIPT_URL.includes('/edit') || SCRIPT_URL.includes('/u/0/home/projects')) {
    // Log for server-side debugging
    console.warn('submit-order: rejected script URL looks like editor URL:', SCRIPT_URL);

    const baseError = 'Script URL appears to be the Apps Script editor URL. Set NEXT_PUBLIC_SHEET_SCRIPT_URL to the deployed web app URL (the "web app" exec URL), not the editor /edit URL.';

    // In development include the resolved SCRIPT_URL in the response to help debugging
    if (process.env.NODE_ENV !== 'production') {
      return NextResponse.json(
        {
          success: false,
          error: baseError,
          debug: { scriptUrl: SCRIPT_URL, envFound: !!process.env.NEXT_PUBLIC_SHEET_SCRIPT_URL },
        },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: false, error: baseError }, { status: 400 });
  }

  try {
    const body = await req.json();

    // If client sent an envelope { action, payload }, forward only payload
    const forwardBody = body && body.payload ? body.payload : body;
    console.info('submit-order: forwarding payload to Apps Script:', forwardBody);

    const res = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(forwardBody),
    });

    const text = await res.text();

    // Try to parse JSON, otherwise return text
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
