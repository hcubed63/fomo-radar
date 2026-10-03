import { NextRequest, NextResponse } from 'next/server';
import { analyzeMint } from '@/lib/analyze';
import type { AnalysisResult } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const mint = (body?.mint || '').toString().trim();

    if (!mint || mint.length < 32) {
      return NextResponse.json({ error: 'Invalid mint' }, { status: 400 });
    }

    const result: AnalysisResult = await analyzeMint(mint);
    return NextResponse.json(result);
  } catch (e: any) {
    const msg = e?.message || 'Analysis failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
