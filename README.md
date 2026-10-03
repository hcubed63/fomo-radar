This is **FOMO Radar** — a Solana momentum intelligence dashboard built to the detailed product spec.

- Dual scores (FOMO Opportunity 0-100 + Exit Risk 0-100)
- 5 stages + sequence detection
- 7 radar cards with acceleration + historical comparisons
- Event timeline + AI-style assessment
- Live DexScreener + RugCheck analysis + full spec-matching demo

See `SUMMARY.md` for a complete record of what was built in this session.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Real-time Social Radar (optional but recommended)

Social Radar currently falls back to a 5m volume + buy pressure proxy when no key is present.

For actual realtime social value (mentions, interactions, attention velocity feeding Opportunity + Risk):

1. Sign up at https://lunarcrush.com/en/developers and create an API key (paid tier required for social data).
2. Set the env var (server only):
   - Local: `LUNARCRUSH_API_KEY=your_key npm run dev`
   - Vercel: `vercel env add LUNARCRUSH_API_KEY` (then `vercel --prod`)
3. Re-analyze or Refresh All. The Social Radar card will show a LIVE badge and use live attention data. `dataSources` will include "lunarcrush" and `isDemoData` becomes false for that result.
4. Without the key (or for demo tokens) everything behaves exactly as before (pure proxy, `isDemoData: true`).

No client exposure. Short server cache (55s) to stay realtime while respecting rate limits.

## Fits the recommended stack (from @goatyishere on X)

FOMO Radar is the **free deep-analysis** piece for Solana memecoins:

- Paste any mint → dual Opportunity / Exit Risk gauges, 7 radar cards (Social driven by free real Pump.fun on-platform comments when available), timeline, provenance.
- Already uses live DexScreener + free Pump.fun reply_count (no paid keys required for core value).

Companion tools from the stack (use alongside Radar):
- fomo.family — social trading, leaderboards, feeds
- rhtrenches.com + fomopulse.app — live tapes of top traders (note: Robinhood Chain specific)
- stalkchain.com — Solana KOL/smart wallet feeds and leaderboards (highly relevant for your tokens)
- hoodwatch.io — whale flows and holdings
- FOMO Tracking Bot (Telegram) — alerts

In the app: after analyzing a mint you will see direct links in the header (and compact ones on My Tokens cards) to jump straight to these tools with context.

All free. No new costs or dependencies. Radar stays focused on scored, provenanced analysis.
