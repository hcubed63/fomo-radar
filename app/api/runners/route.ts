import { NextResponse } from 'next/server';
import { scoreRunner, type RunnerHit } from '../../../lib/runners';
import { fetchPumpCoins, fetchDexPairs, poolCheck } from '../../../lib/pump';

const CACHE: RequestInit = { next: { revalidate: 20 } };

export async function GET() {
  try {
    const coins = await fetchPumpCoins(4, CACHE);

    const ranked = coins
      .map((coin) => scoreRunner(coin))
      .filter((hit): hit is RunnerHit => !!hit && (hit.status === 'alert' || hit.status === 'watch'))
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === 'alert' ? -1 : 1;
        return b.fillPerMin - a.fillPerMin;
      })
      .slice(0, 12);

    const pairs = await fetchDexPairs(ranked.map((h) => h.mint), CACHE);
    const checked: RunnerHit[] = [];
    for (const hit of ranked) {
      const list = pairs.get(hit.mint);
      const check = poolCheck(hit, list);
      if (!check.ok) continue;
      const liq = check.pair?.liquidity?.usd;
      let note: string;
      if (list == null) note = 'Pool check failed, so price action is unconfirmed.';
      else if (!check.pair) note = 'Not on Dexscreener yet.';
      else if (check.pair.dexId === 'pumpfun' || !liq) note = 'Still on the bonding curve, price not rolling over.';
      else note = `Pool $${Math.round(liq).toLocaleString()} and price not rolling over.`;
      checked.push({ ...hit, reason: `${hit.reason} ${note}` });
    }

    return NextResponse.json({
      tokens: checked,
      note: 'Alert = curve filling, $4k–25k market cap, at least 4 minutes old. It is not a buy signal.',
    });
  } catch (e) {
    console.error('Runner fetch failed', e);
    return NextResponse.json({ tokens: [] });
  }
}
