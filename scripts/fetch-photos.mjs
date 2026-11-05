// Fetches real, openly licensed photos (CC0, public domain, CC BY, CC BY-SA) for each kind of event and writes
// frontend/public/photos/<kind>.jpg plus credits.txt, which the site shows in its footer. Needs internet access.
// Usage: npm run photos     (re-run to refresh; a kind with no result is skipped and the site draws a picture instead)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const skill = join(root, '.agents/skills/design-taste-frontend/scripts/assets.mjs');
const out = join(root, 'frontend/public/photos');
mkdirSync(out, { recursive: true });

const QUERIES = {
  hackathon: 'hackathon students laptops',
  workshop: 'students workshop computer lab',
  mic: 'open mic night stage',
  robotics: 'robotics competition students',
  design: 'design sprint sticky notes team',
  ml: 'data science meetup presentation',
  talk: 'conference speaker audience',
};
const credits = [];
for (const [kind, q] of Object.entries(QUERIES)) {
  try {
    const found = JSON.parse(execFileSync('node', [skill, q, '--orientation', 'landscape', '--limit', '3', '--min-width', '1200', '--json'], { encoding: 'utf8' }));
    const list = Array.isArray(found) ? found : Object.values(found).flat();
    const pick = list.find((r) => r && r.ref);
    if (!pick) { console.log(`${kind}: nothing found`); continue; }
    execFileSync('node', [skill, '--get', pick.ref, '--to', out, '--name', `${kind}.jpg`, '--width', '1400'], { stdio: 'inherit' });
    credits.push(`${pick.title ?? kind} by ${pick.creator ?? 'unknown'} (${pick.license ?? 'open licence'})`);
    console.log(`${kind}: ${pick.ref}`);
  } catch (e) { console.log(`${kind}: skipped (${e.message.split('\n')[0]})`); }
}
if (credits.length) writeFileSync(join(out, 'credits.txt'), credits.join('\n') + '\n');
console.log(`Done. ${credits.length} of ${Object.keys(QUERIES).length} photos saved in frontend/public/photos.`);
