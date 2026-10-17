import { createHash, timingSafeEqual } from 'crypto';

/**
 * SHA-256 of the alert trigger secret held by the Cloudflare Worker (fomo-radar-cron).
 * Only the hash lives in the repo, so the endpoint is protected even before
 * CRON_SECRET is added on Vercel. If CRON_SECRET is set on Vercel it is accepted too.
 */
const TRIGGER_SECRET_SHA256 = '4fd2ab033ceef355b0decd2847b51ae501415fce452f3f7a859531803f286547';

function sha256(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

function providedSecret(req: Request): string | null {
  const auth = req.headers.get('authorization');
  if (auth && auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  const key = new URL(req.url).searchParams.get('key');
  return key ? key.trim() : null;
}

export function isAuthorized(req: Request): boolean {
  const given = providedSecret(req);
  if (!given) return false;
  const givenHash = sha256(given);
  const accepted: Buffer[] = [Buffer.from(TRIGGER_SECRET_SHA256, 'hex')];
  const envSecret = process.env.CRON_SECRET;
  if (envSecret) accepted.push(sha256(envSecret));
  return accepted.some((h) => h.length === givenHash.length && timingSafeEqual(h, givenHash));
}
