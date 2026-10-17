/**
 * Shared data fetching for Early Runners and Telegram alerts.
 * Sources: pump.fun site API (unofficial) and Dexscreener (free, no key).
 */
import type { PumpCoinRaw, RunnerHit } from './runners';

// pump.fun's API returns 403 to requests without browser-style headers.
const PUMP_HEADERS: Record<string, string> = {
  Accept: 'application/json',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36',
  Origin: 'https://pump.fun',
  Referer: 'https://pump.fun/',
};

const PAGE_SIZE = 50;

async function fetchPage(sort: string, offset: number, init: RequestInit): Promise<PumpCoinRaw[]> {
  const url = `https://frontend-api-v3.pump.fun/coins?offset=${offset}&limit=${PAGE_SIZE}&sort=${sort}&order=DESC&includeNsfw=false`;
  try {
    const res = await fetch(url, { ...init, headers: PUMP_HEADERS });
    if (!res.ok) {
      console.error(`pump.fun ${sort} offset ${offset} returned ${res.status}`);
      return [];
    }
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error(`pump.fun ${sort} offset ${offset} failed`, e);
    return [];
  }
}

/**
 * Newest launches plus most recently traded coins, several pages each.
 * pump.fun launches ~30 coins a minute, so one page of "newest" is all under 2 minutes old.
 */
export async function fetchPumpCoins(pages = 4, init: RequestInit = { cache: 'no-store' }): Promise<PumpCoinRaw[]> {
  const jobs: Promise<PumpCoinRaw[]>[] = [];
  for (let i = 0; i < pages; i++) {
    jobs.push(fetchPage('created_timestamp', i * PAGE_SIZE, init));
    jobs.push(fetchPage('last_trade_timestamp', i * PAGE_SIZE, init));
  }
  const lists = await Promise.all(jobs);
  const byMint = new Map<string, PumpCoinRaw>();
  for (const list of lists) for (const coin of list) if (coin?.mint) byMint.set(coin.mint, coin);
  return [...byMint.values()];
}

export interface DexPair {
  dexId?: string;
  pairAddress?: string;
  baseToken?: { address?: string; symbol?: string; name?: string };
  liquidity?: { usd?: number | null } | null;
  marketCap?: number | null;
  fdv?: number | null;
  priceChange?: { m5?: number; h1?: number };
  txns?: { m5?: { buys?: number; sells?: number } };
  volume?: { m5?: number; h1?: number; h24?: number };
}

/** Best pair for a mint: the deepest real pool, otherwise the pump.fun curve pair, otherwise the busiest pair. */
export function bestPair(pairs: DexPair[]): DexPair | null {
  if (!pairs.length) return null;
  const withLiq = pairs.filter((p) => (p.liquidity?.usd || 0) > 0);
  if (withLiq.length) return withLiq.reduce((a, b) => ((b.liquidity?.usd || 0) > (a.liquidity?.usd || 0) ? b : a));
  const curve = pairs.find((p) => p.dexId === 'pumpfun');
  if (curve) return curve;
  return pairs.reduce((a, b) => ((b.volume?.h1 || 0) > (a.volume?.h1 || 0) ? b : a));
}

/** Dexscreener pairs for up to 30 mints per call. Returns null for a mint if the lookup failed. */
export async function fetchDexPairs(mints: string[], init: RequestInit = { cache: 'no-store' }): Promise<Map<string, DexPair[] | null>> {
  const out = new Map<string, DexPair[] | null>();
  const chunks: string[][] = [];
  for (let i = 0; i < mints.length; i += 30) chunks.push(mints.slice(i, i + 30));
  await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const res = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${chunk.join(',')}`, {
          ...init,
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) throw new Error(`dexscreener ${res.status}`);
        const data: DexPair[] = await res.json();
        for (const m of chunk) out.set(m, []);
        if (Array.isArray(data)) {
          for (const p of data) {
            const m = p.baseToken?.address;
            if (m && out.has(m)) out.get(m)!.push(p);
          }
        }
      } catch (e) {
        console.error('Dexscreener lookup failed', e);
        for (const m of chunk) out.set(m, null);
      }
    }),
  );
  return out;
}

export type PoolCheck = { ok: true; pair: DexPair | null } | { ok: false; why: string };

/**
 * Is there still a real bid? Bonding-curve coins (dexId "pumpfun") have no liquidity number,
 * so they pass on price action alone. Graduated pools need $2k+ liquidity.
 */
export function poolCheck(hit: RunnerHit, pairs: DexPair[] | null | undefined): PoolCheck {
  if (pairs == null) return { ok: true, pair: null }; // lookup failed: rely on pump.fun curve data
  const pair = bestPair(pairs);
  if (!pair) return { ok: true, pair: null }; // not indexed yet: still on the curve
  const onCurve = pair.dexId === 'pumpfun' || !(pair.liquidity?.usd && pair.liquidity.usd > 0);
  if (!onCurve && (pair.liquidity?.usd || 0) < 2000) return { ok: false, why: 'thin pool' };
  const m5 = pair.priceChange?.m5;
  const h1 = pair.priceChange?.h1;
  if ((m5 != null && m5 <= -8) || (h1 != null && h1 <= -15)) return { ok: false, why: 'price rolling over' };
  const buys = pair.txns?.m5?.buys || 0;
  const sells = pair.txns?.m5?.sells || 0;
  if (sells > buys && sells >= 8) return { ok: false, why: 'more sellers than buyers' };
  return { ok: true, pair };
}
