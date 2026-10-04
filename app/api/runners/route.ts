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

interface DexPair {
  liquidity?: { usd?: number };
  priceChange?: { m5?: number; h1?: number };
  txns?: { m5?: { buys?: number; sells?: number } };
  volume?: { m5?: number };
}

async function dexGate(hit: RunnerHit): Promise<RunnerHit | null> {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${hit.mint}`, {
      next: { revalidate: 20 },
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return hit.status === 'alert' ? { ...hit, status: 'watch', reason: 'No live pool check yet. Treat as unconfirmed.' } : hit;
    const data = await res.json();
    const pairs: DexPair[] = Array.isArray(data.pairs) ? data.pairs : [];
    if (pairs.length === 0) {
      // Still on the curve. Curve speed alone is not enough for an alert.
      return hit.status === 'alert'
        ? { ...hit, status: 'watch', reason: 'Curve is filling, but there is no pool yet to confirm a real bid.' }
        : hit;
    }
    const pair = pairs.reduce((best, p) => ((p.liquidity?.usd || 0) > (best.liquidity?.usd || 0) ? p : best), pairs[0]);
    const liq = pair.liquidity?.usd || 0;
    const m5 = pair.priceChange?.m5;
    const h1 = pair.priceChange?.h1;
    const buys = pair.txns?.m5?.buys || 0;
    const sells = pair.txns?.m5?.sells || 0;

    if (liq < 300) return null;  // TEMP test - was 2000

    if ((m5 != null && m5 <= -8) || (h1 != null && h1 <= -15)) return null;
    if (sells > buys && sells >= 8) return null;

    return {
      ...hit,
      reason: `${hit.reason} Pool $${Math.round(liq).toLocaleString()} and price not rolling over.`,
    };
  } catch {
    return hit.status === 'alert' ? { ...hit, status: 'watch', reason: 'Pool check failed. Not confirmed.' } : hit;
  }
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

    const checked = (await Promise.all(ranked.map(dexGate))).filter((hit): hit is RunnerHit => !!hit);

    return NextResponse.json({
      tokens: checked,
      note: 'Alert needs a filling curve (TEMP very loose test limits). It is not a buy signal.',
    });
  } catch (e) {
    console.error('Runner fetch failed', e);
    return NextResponse.json({ tokens: [] });
  }
}
