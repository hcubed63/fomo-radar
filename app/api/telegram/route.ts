import { NextResponse } from 'next/server';
import { scoreRunner, type PumpCoinRaw, type RunnerHit } from '../../../lib/runners';

const sent = new Set<string>();

async function fetchCoins(sort: string): Promise<PumpCoinRaw[]> {
  const url = `https://frontend-api-v3.pump.fun/coins?offset=0&limit=50&sort=${sort}&order=DESC&includeNsfw=false`;
  const res = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function stillBid(hit: RunnerHit): Promise<boolean> {
  const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${hit.mint}`, { cache: 'no-store' });
  if (!res.ok) return hit.status === 'watch';
  const data = await res.json();
  const pairs = Array.isArray(data.pairs) ? data.pairs : [];
  if (pairs.length === 0) return false;
  const liq = Math.max(...pairs.map((p: { liquidity?: { usd?: number } }) => p.liquidity?.usd || 0));
  const pair = pairs[0];
  const m5 = pair.priceChange?.m5;
  const h1 = pair.priceChange?.h1;
  if (liq < 2000) return false;
  if ((m5 != null && m5 <= -8) || (h1 != null && h1 <= -15)) return false;
  return true;
}

async function send(hit: RunnerHit, token: string, chatId: string) {
  const mc = hit.marketCap >= 1000 ? `$${(hit.marketCap / 1000).toFixed(1)}k` : `$${hit.marketCap}`;
  const text = `${hit.status === 'alert' ? 'ALERT' : 'WATCH'} ${hit.symbol}\n${mc} · ${hit.ageMin}m old · curve ${hit.curvePct}%\n${hit.reason}`;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      reply_markup: {
        inline_keyboard: [[{ text: 'Open in Fomo', url: `https://fomo.family/tokens/solana/${hit.mint}` }]],
      },
    }),
  });
}

export async function GET() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return NextResponse.json({ ok: false, error: 'telegram not configured' }, { status: 500 });

  const [fresh, active] = await Promise.all([fetchCoins('created_timestamp'), fetchCoins('last_trade_timestamp')]);
  const byMint = new Map<string, PumpCoinRaw>();
  for (const coin of [...fresh, ...active]) if (coin?.mint) byMint.set(coin.mint, coin);

  const hits = [...byMint.values()]
    .map((coin) => scoreRunner(coin))
    .filter((hit): hit is RunnerHit => !!hit && hit.status === 'alert')
    .slice(0, 5);

  let sentCount = 0;
  for (const hit of hits) {
    if (sent.has(hit.mint)) continue;
    if (!(await stillBid(hit))) continue;
    sent.add(hit.mint);
    await send(hit, token, chatId);
    sentCount += 1;
  }
  return NextResponse.json({ ok: true, sent: sentCount });
}
