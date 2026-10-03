/**
 * Early-runner score for Pump.fun bonding-curve coins.
 * (Temporarily loosened for testing so some results appear.)
 * Original was very strict: under $25k, fast fill, very early curve.
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

  if (ageMin > 400 && curvePct < 60) {
    return { ...base, status: 'stalled', reason: 'Curve has been sitting a long time. Not a fresh run.' };
  }
  if (mc > 100000 || curvePct >= 92) {
    return { ...base, status: 'late', reason: 'Already up the curve (loosened test limit).' };
  }
  if (held < 0.4 && ath > mc * 2) {
    return { ...base, status: 'late', reason: 'Already dumped hard off its high.' };
  }

  // Loosened test thresholds (original was much stricter)
  if (mc >= 1000 && mc <= 75000 && ageMin <= 120 && curvePct >= 5 && curvePct <= 80 && fillPerMin >= 0.3) {
    return {
      ...base,
      status: 'alert',
      reason: 'Curve filling, still early (loosened test: under ~$75k).',
    };
  }

  if (mc < 100000 && ageMin <= 300 && curvePct >= 3 && curvePct <= 90 && fillPerMin >= 0.15) {
    return {
      ...base,
      status: 'watch',
      reason: 'Early-ish curve (loosened test limits).',
    };
  }

  return null;
}
