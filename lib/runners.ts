/**
 * Early-runner score for Pump.fun bonding-curve coins.
 * Alerts only while the curve is still filling and market cap is under $25k.
 * A vertical chart or a near-graduated coin is already late.
 */

export type RunnerStatus = 'alert' | 'watch' | 'late' | 'stalled';

export interface PumpCoinRaw {
  mint: string;
  symbol?: string;
  name?: string;
  image_uri?: string;
  usd_market_cap?: number;
  market_cap_usd?: number;
  market_cap?: number;
  reply_count?: number;
  created_timestamp?: number;
  complete?: boolean;
  real_sol_reserves?: number;
  ath_market_cap?: number;
  ath_market_cap_timestamp?: number;
}

export interface RunnerHit {
  mint: string;
  symbol: string;
  name: string;
  image: string | null;
  marketCap: number;
  replies: number;
  ageMin: number;
  curvePct: number;
  fillPerMin: number;
  status: RunnerStatus;
  reason: string;
}

const GRADUATION_SOL = 85;
const LAMPORTS = 1_000_000_000;

export function marketCapUsd(coin: PumpCoinRaw): number {
  const usd = coin.market_cap_usd || coin.usd_market_cap;
  if (usd && usd > 0) return usd;
  return 0;
}

export function curvePercent(coin: PumpCoinRaw): number {
  const sol = (coin.real_sol_reserves || 0) / LAMPORTS;
  return Math.max(0, Math.min(100, (sol / GRADUATION_SOL) * 100));
}

export function scoreRunner(coin: PumpCoinRaw, now = Date.now()): RunnerHit | null {
  if (!coin.mint || coin.complete) return null;
  const mc = marketCapUsd(coin);
  if (mc <= 0) return null;

  const created = coin.created_timestamp || now;
  const ageMin = Math.max(0.5, (now - created) / 60000);
  const curvePct = curvePercent(coin);
  const fillPerMin = curvePct / ageMin;
  const ath = coin.ath_market_cap && coin.ath_market_cap > 1000 ? coin.ath_market_cap : mc;
  const held = mc / Math.max(ath, 1);

  const base = {
    mint: coin.mint,
    symbol: coin.symbol || coin.name?.slice(0, 10) || '???',
    name: coin.name || coin.symbol || 'Unknown',
    image: coin.image_uri || null,
    marketCap: Math.round(mc),
    replies: coin.reply_count || 0,
    ageMin: Math.round(ageMin),
    curvePct: Math.round(curvePct),
    fillPerMin: Math.round(fillPerMin * 10) / 10,
  };

  if (ageMin > 180 && curvePct < 80) {
    return { ...base, status: 'stalled', reason: 'Curve has been sitting. Not a fresh run.' };
  }
  if (mc > 40000 || curvePct >= 85) {
    return { ...base, status: 'late', reason: 'Already up the curve. This is the chase, not the find.' };
  }
  if (held < 0.55 && ath > mc * 1.5) {
    return { ...base, status: 'late', reason: 'Already dumped off its high.' };
  }

  if (mc >= 4000 && mc <= 25000 && ageMin <= 45 && curvePct >= 12 && curvePct <= 65 && fillPerMin >= 0.8) {
    return {
      ...base,
      status: 'alert',
      reason: 'Curve filling fast, still under $25k, before graduation.',
    };
  }

  if (mc < 40000 && ageMin <= 90 && curvePct >= 8 && curvePct <= 80 && fillPerMin >= 0.35) {
    return {
      ...base,
      status: 'watch',
      reason: 'Early curve, not fast enough yet for an alert.',
    };
  }

  return null;
}
