import { NextResponse } from 'next/server';
import { scoreRunner, type PumpCoinRaw, type RunnerHit } from '../../../lib/runners';

async function fetchCoins(sort: string): Promise<PumpCoinRaw[]> {
  const url = `https://frontend-api-v3.pump.fun/coins?offset=0&limit=50&sort=${sort}&order=DESC&includeNsfw=false`;
  const res = await fetch(url, {
    next: { revalidate: 20 },
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function GET() {
  try {
    const [fresh, active] = await Promise.all([
      fetchCoins('created_timestamp'),
      fetchCoins('last_trade_timestamp'),
    ]);

    const byMint = new Map<string, PumpCoinRaw>();
    for (const coin of [...fresh, ...active]) {
      if (coin?.mint) byMint.set(coin.mint, coin);
    }

    const ranked = [...byMint.values()]
      .map((coin) => scoreRunner(coin))
      .filter((hit): hit is RunnerHit => !!hit && (hit.status === 'alert' || hit.status === 'watch'))
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === 'alert' ? -1 : 1;
        return b.fillPerMin - a.fillPerMin;
      })
      .slice(0, 12);

    return NextResponse.json({
      tokens: ranked,
      note: 'Alert means the curve is filling and market cap is still under $25k. It is not a buy signal.',
    });
  } catch (e) {
    console.error('Runner fetch failed', e);
    return NextResponse.json({ tokens: [] });
  }
}
