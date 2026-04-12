import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const res = await fetch('http://127.0.0.1:1234/api/v0/models');
    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch models' }, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: 'Failed to connect to LMStudio' }, { status: 500 });
  }
}