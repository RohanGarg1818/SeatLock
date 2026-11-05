import 'server-only';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Real photographs of events live in frontend/public/photos/<kind>.jpg (fetched with `npm run photos`, which only takes
// openly licensed pictures and writes credits.txt). A missing file is not an error: the page draws a picture instead.
import { KINDS, type Kind } from './kind';
export { kindOf, type Kind } from './kind';

const dir = join(process.cwd(), 'public', 'photos');
export function photoSrc(kind: Kind): string | null {
  return existsSync(join(dir, `${kind}.jpg`)) ? `/photos/${kind}.jpg` : null;
}
export function photoCredits(): string[] {
  try { return readFileSync(join(dir, 'credits.txt'), 'utf8').split('\n').map((l) => l.trim()).filter(Boolean); } catch { return []; }
}

/** Which kinds have a real photo on disk: computed on the server, then passed down to client components. */
export function photoMap(): Partial<Record<Kind, string>> {
  const m: Partial<Record<Kind, string>> = {};
  for (const k of KINDS) { const p = photoSrc(k); if (p) m[k] = p; }
  return m;
}
