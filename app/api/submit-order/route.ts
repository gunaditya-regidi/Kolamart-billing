import { NextRequest, NextResponse } from 'next/server';

const DEFAULT_SCRIPT_URL =
  'https://script.google.com/u/0/home/projects/1J8JsOqwshQGMAbevl8mXQOBzTQq4xOV3RWSorZkCXId3Z8O5Rvy_oP8e/edit';

export async function POST(req: NextRequest) {
  const SCRIPT_URL = process.env.NEXT_PUBLIC_SHEET_SCRIPT_URL || DEFAULT_SCRIPT_URL;
  if (!SCRIPT_URL) {
    return NextResponse.json({ success: false, error: 'Missing script URL' }, { status: 500 });
  }

  try {
    const body = await req.json();

    const res = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
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
