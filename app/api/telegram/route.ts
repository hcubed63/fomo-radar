import { NextResponse } from 'next/server';
import { scoreRunner, type PumpCoinRaw, type RunnerHit } from '../../../lib/runners';
import { fetchPumpCoins, fetchDexPairs, poolCheck } from '../../../lib/pump';
import { isAuthorized } from '../../../lib/cronAuth';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Backup only: resets on cold starts. The scheduled trigger passes the persistent seen list.
const sentThisInstance = new Set<string>();
const MAX_ALERTS_PER_RUN = 5;

// Quality checks done by the Cloudflare cron Worker (holders, top wallet, dev sells, socials, fill speed).
interface Quality { pass: boolean; score: number; line: string; why: string[] }
const qualityByMint = new Map<string, Quality>();

function fmtUsd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return 'unknown';
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${Math.round(n)}`;
}

async function send(hit: RunnerHit, token: string, chatId: string): Promise<string | null> {
  const q = qualityByMint.get(hit.mint);
  const text = q
    ? `ALERT ${hit.symbol} · score ${q.score}/10\n${fmtUsd(hit.marketCap)} · ${hit.ageMin}m old · curve ${hit.curvePct}%\n${q.line}\nTake profit ~${fmtUsd(hit.marketCap * 1.25)} mcap (+25%) / Stop ~${fmtUsd(hit.marketCap * 0.85)} mcap (-15%)\nNot a buy. Check the chart first.`
    : `ALERT ${hit.symbol}\n${fmtUsd(hit.marketCap)} · ${hit.ageMin}m old · curve ${hit.curvePct}%\n${hit.reason}`;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
        reply_markup: {
          inline_keyboard: [[
            { text: 'Open in Fomo', url: `https://fomo.family/tokens/solana/${hit.mint}` },
            { text: 'Buy in Trojan', url: `https://t.me/solana_trojanbot?start=r-hcubed63-${hit.mint}` },
          ]],
        },
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const err = `telegram ${res.status}: ${(body as { description?: string }).description || 'send failed'}`;
      console.error(`Telegram send failed for ${hit.mint}: ${err}`);
      return err;
    }
    return null;
  } catch (e) {
    const err = `telegram request failed: ${e instanceof Error ? e.message : String(e)}`;
    console.error(`Telegram send failed for ${hit.mint}: ${err}`);
    return err;
  }
}

async function run(seen: Set<string>, pushed: PumpCoinRaw[] | null) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.error('Telegram alert run: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing');
    return NextResponse.json({ ok: false, error: 'telegram not configured' }, { status: 500 });
  }

  // pump.fun's API blocks most server fetches (Cloudflare bot check), so the trigger can push the coin list it fetched.
  const source = pushed && pushed.length ? 'pushed' : 'fetched';
  const coins = pushed && pushed.length ? pushed : await fetchPumpCoins(4);
  qualityByMint.clear();
  for (const c of coins) {
    const q = (c as PumpCoinRaw & { quality?: Quality }).quality;
    if (q && typeof q.pass === 'boolean' && typeof q.score === 'number') qualityByMint.set(c.mint, q);
  }
  const hits = coins
    .map((coin) => scoreRunner(coin))
    .filter((hit): hit is RunnerHit => !!hit && hit.status === 'alert')
    .filter((hit) => !seen.has(hit.mint) && !sentThisInstance.has(hit.mint))
    // Only coins the Worker checked and passed (no quality data = not checked = no alert).
    .filter((hit) => qualityByMint.get(hit.mint)?.pass === true)
    .sort((a, b) => (qualityByMint.get(b.mint)!.score - qualityByMint.get(a.mint)!.score) || b.fillPerMin - a.fillPerMin);

  const pairs = await fetchDexPairs(hits.map((h) => h.mint));
  const sentMints: string[] = [];
  const errors: string[] = [];
  const skipped: Record<string, string> = {};

  for (const hit of hits) {
    if (sentMints.length >= MAX_ALERTS_PER_RUN) break;
    const check = poolCheck(hit, pairs.get(hit.mint));
    if (!check.ok) {
      skipped[hit.mint] = check.why;
      continue;
    }
    const err = await send(hit, token, chatId);
    if (err) {
      errors.push(err);
      continue;
    }
    sentThisInstance.add(hit.mint);
    sentMints.push(hit.mint);
  }

  if (coins.length === 0) console.error('Telegram alert run: pump.fun returned no coins');
  return NextResponse.json({
    ok: errors.length === 0 && coins.length > 0,
    source,
    scanned: coins.length,
    candidates: hits.length,
    sent: sentMints.length,
    sentMints,
    skipped,
    errors,
  });
}

// Manual trigger: GET /api/telegram?key=SECRET or Authorization: Bearer SECRET
export async function GET(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  return run(new Set(), null);
}

// Scheduled trigger: POST with Authorization: Bearer SECRET and body
// { seen: [mints already alerted], coins?: [pump.fun coin objects] }
export async function POST(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  let seen: string[] = [];
  let coins: PumpCoinRaw[] | null = null;
  try {
    const body = await req.json();
    if (Array.isArray(body?.seen)) seen = body.seen.filter((m: unknown): m is string => typeof m === 'string').slice(0, 5000);
    if (Array.isArray(body?.coins)) {
      coins = body.coins
        .filter((c: unknown): c is PumpCoinRaw => !!c && typeof (c as PumpCoinRaw).mint === 'string')
        .slice(0, 1000);
    }
  } catch {
    // no body: treat as nothing seen
  }
  return run(new Set(seen), coins);
}
