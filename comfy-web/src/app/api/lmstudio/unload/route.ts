import { NextResponse } from 'next/server';

export async function POST() {
  try {
    const res = await fetch('http://127.0.0.1:1234/api/v0/unload', {
      method: 'POST',
    });
    
    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to unload model' }, { status: res.status });
    }
    
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to connect to LMStudio' }, { status: 500 });
  }
}