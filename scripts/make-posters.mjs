// Draws the demo event posters (frontend/public/posters/<slug>.svg). Original flat artwork in the site's own palette,
// so the demo data has real cover images without any download or licence to track.   Usage: node scripts/make-posters.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'frontend', 'public', 'posters');
mkdirSync(out, { recursive: true });

const INK = '#141414', CREAM = '#fff1e8', PEACH = '#fdd4b6', TAN = '#da915a', ORANGE = '#e8883a', YELLOW = '#f4c542', SAGE = '#b9d3a0', SKY = '#a9c8f0', PINK = '#f6a9b8', WHITE = '#ffffff';
const S = (w = 6) => `stroke="${INK}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
const star = (cx, cy, r, fill, n = 12, rot = 0) => {
  const pts = [];
  for (let i = 0; i < n * 2; i++) { const a = (Math.PI * i) / n + rot; const rr = i % 2 ? r * 0.82 : r; pts.push(`${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`); }
  return `<polygon points="${pts.join(' ')}" fill="${fill}" ${S(5)}/>`;
};
const dots = (c) => `<defs><pattern id="d" width="36" height="36" patternUnits="userSpaceOnUse"><circle cx="6" cy="6" r="2.4" fill="${c}" opacity=".35"/></pattern></defs><rect width="800" height="600" fill="url(#d)"/>`;

const art = {
  hackathon: () => `
    <rect x="170" y="150" width="460" height="290" rx="22" fill="${WHITE}" ${S()}/>
    <rect x="196" y="176" width="408" height="238" rx="10" fill="${INK}"/>
    <path d="M240 232l-34 28 34 28M560 232l34 28-34 28" fill="none" stroke="${YELLOW}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M444 222l-80 90" stroke="${ORANGE}" stroke-width="12" stroke-linecap="round"/>
    <path d="M110 452h580l-44 40H154z" fill="${TAN}" ${S()}/>
    ${star(640, 120, 62, YELLOW)}<text x="640" y="130" text-anchor="middle" font-family="Arial Black, Helvetica, sans-serif" font-size="30" fill="${INK}">24H</text>
    <circle cx="150" cy="130" r="26" fill="${SAGE}" ${S()}/>`,
  workshop: () => `
    <rect x="130" y="130" width="540" height="340" rx="20" fill="${WHITE}" ${S()}/>
    <rect x="130" y="130" width="540" height="54" rx="20" fill="${YELLOW}" ${S()}/>
    <circle cx="170" cy="157" r="9" fill="${INK}"/><circle cx="200" cy="157" r="9" fill="${INK}"/><circle cx="230" cy="157" r="9" fill="${INK}"/>
    <path d="M175 235l40 32-40 32" fill="none" stroke="${ORANGE}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M245 300h120" stroke="${INK}" stroke-width="12" stroke-linecap="round"/>
    <path d="M410 240h190M410 288h140M175 360h360M175 405h250" stroke="${TAN}" stroke-width="12" stroke-linecap="round"/>
    ${star(660, 470, 56, SAGE, 10)}<path d="M635 470l18 18 34-38" fill="none" ${S(8)}/>`,
  mic: () => `
    <path d="M400 40 120 560h560z" fill="${YELLOW}" opacity=".45"/>
    <rect x="340" y="120" width="120" height="210" rx="60" fill="${INK}"/>
    <rect x="340" y="120" width="120" height="210" rx="60" fill="none" ${S()}/>
    <path d="M345 170h110M345 215h110M345 260h110" stroke="${TAN}" stroke-width="7"/>
    <path d="M285 290a115 115 0 0 0 230 0M400 405v95M330 505h140" fill="none" ${S(14)}/>
    <g fill="${ORANGE}" ${S(5)}><circle cx="170" cy="240" r="22"/><path d="M192 240V150l60-14v34l-60 14" /><circle cx="610" cy="190" r="22"/><path d="M632 190v-85l60-14v34l-60 14"/></g>
    ${star(640, 440, 60, PINK, 10)}`,
  robotics: () => `
    <rect x="240" y="190" width="320" height="250" rx="40" fill="${WHITE}" ${S()}/>
    <rect x="285" y="250" width="86" height="70" rx="22" fill="${INK}"/><rect x="429" y="250" width="86" height="70" rx="22" fill="${INK}"/>
    <circle cx="328" cy="285" r="14" fill="${YELLOW}"/><circle cx="472" cy="285" r="14" fill="${YELLOW}"/>
    <path d="M330 375h140" ${S(12)} fill="none"/>
    <path d="M400 190v-55" ${S(10)}/><circle cx="400" cy="118" r="26" fill="${ORANGE}" ${S()}/>
    <rect x="170" y="270" width="48" height="90" rx="20" fill="${TAN}" ${S()}/><rect x="582" y="270" width="48" height="90" rx="20" fill="${TAN}" ${S()}/>
    <rect x="300" y="450" width="200" height="60" rx="18" fill="${INK}"/><circle cx="335" cy="512" r="24" fill="${YELLOW}" ${S()}/><circle cx="465" cy="512" r="24" fill="${YELLOW}" ${S()}/>
    ${star(650, 130, 54, SAGE, 10)}<path d="M630 130h40M650 110v40" ${S(7)}/>`,
  design: () => `
    <g ${S()}><rect x="110" y="120" width="230" height="230" fill="${YELLOW}" transform="rotate(-7 225 235)"/>
    <rect x="400" y="100" width="230" height="230" fill="${PINK}" transform="rotate(6 515 215)"/>
    <rect x="250" y="300" width="230" height="230" fill="${SAGE}" transform="rotate(-3 365 415)"/></g>
    <path d="M160 200h120M160 245h90" stroke="${INK}" stroke-width="9" stroke-linecap="round" transform="rotate(-7 225 235)"/>
    <path d="M450 180h130M450 225h80" stroke="${INK}" stroke-width="9" stroke-linecap="round" transform="rotate(6 515 215)"/>
    <path d="M300 385h130M300 430h90" stroke="${INK}" stroke-width="9" stroke-linecap="round" transform="rotate(-3 365 415)"/>
    <path d="M610 380l-70 150-25-55-55-25z" fill="${WHITE}" ${S()}/>`,
  ml: () => `
    <g stroke="${INK}" stroke-width="5"><path d="M180 170 400 300 620 170M180 430 400 300 620 430M180 170v260M620 170v260M180 300h440" fill="none"/></g>
    <g ${S()}><circle cx="180" cy="170" r="38" fill="${YELLOW}"/><circle cx="180" cy="430" r="38" fill="${PINK}"/><circle cx="620" cy="170" r="38" fill="${SAGE}"/><circle cx="620" cy="430" r="38" fill="${SKY}"/><circle cx="400" cy="300" r="62" fill="${ORANGE}"/><circle cx="180" cy="300" r="30" fill="${WHITE}"/><circle cx="620" cy="300" r="30" fill="${WHITE}"/></g>
    <path d="M375 300l18 18 34-38" fill="none" ${S(9)}/>`,
  talk: () => `
    <path d="M300 250h200l30 230H270z" fill="${WHITE}" ${S()}/><rect x="250" y="480" width="300" height="34" rx="10" fill="${TAN}" ${S()}/>
    <circle cx="400" cy="160" r="52" fill="${PEACH}" ${S()}/><path d="M330 250q70-60 140 0" fill="${INK}"/>
    <path d="M360 330h80M350 375h100" stroke="${ORANGE}" stroke-width="10" stroke-linecap="round"/>
    <g fill="${INK}"><circle cx="110" cy="530" r="34"/><circle cx="190" cy="555" r="30"/><circle cx="610" cy="555" r="30"/><circle cx="690" cy="530" r="34"/></g>
    ${star(650, 130, 58, YELLOW, 10)}<path d="M628 132l16 16 28-32" fill="none" ${S(8)}/>`,
  pitch: () => `
    <path d="M400 70c70 70 90 190 60 290H340c-30-100-10-220 60-290z" fill="${WHITE}" ${S()}/>
    <circle cx="400" cy="205" r="42" fill="${SKY}" ${S()}/>
    <path d="M340 360l-70 70 20-110zM460 360l70 70-20-110z" fill="${ORANGE}" ${S()}/>
    <path d="M365 370h70l-35 120z" fill="${YELLOW}" ${S()}/>
    <path d="M150 140l20-40 20 40-40 0zM610 250l16-30 16 30z" fill="${PINK}" ${S(4)}/>
    ${star(640, 480, 54, SAGE, 10)}<text x="640" y="490" text-anchor="middle" font-family="Arial Black, Helvetica, sans-serif" font-size="34" fill="${INK}">₹</text>`,
  photo: () => `
    <rect x="130" y="190" width="540" height="330" rx="40" fill="${INK}"/>
    <rect x="130" y="190" width="540" height="330" rx="40" fill="none" ${S()}/>
    <rect x="130" y="270" width="540" height="250" rx="0" fill="${TAN}" ${S()}/>
    <rect x="130" y="440" width="540" height="80" rx="40" fill="${TAN}" ${S()}/>
    <rect x="300" y="140" width="140" height="70" rx="18" fill="${WHITE}" ${S()}/>
    <circle cx="400" cy="380" r="110" fill="${WHITE}" ${S()}/><circle cx="400" cy="380" r="72" fill="${SKY}" ${S()}/><circle cx="375" cy="355" r="18" fill="${WHITE}"/>
    <circle cx="600" cy="240" r="16" fill="${YELLOW}" ${S(4)}/>`,
  quiz: () => `
    <path d="M150 110h360a40 40 0 0 1 40 40v190a40 40 0 0 1-40 40H330l-90 80v-80h-90a40 40 0 0 1-40-40V150a40 40 0 0 1 40-40z" fill="${WHITE}" ${S()}/>
    <text x="330" y="300" text-anchor="middle" font-family="Arial Black, Helvetica, sans-serif" font-size="190" fill="${ORANGE}" stroke="${INK}" stroke-width="6">?</text>
    <path d="M560 300h90a40 40 0 0 1 40 40v110a40 40 0 0 1-40 40h-30v60l-70-60h-20a40 40 0 0 1-40-40V340a40 40 0 0 1 40-40z" fill="${YELLOW}" ${S()}/>
    <path d="M580 360h90M580 405h60" stroke="${INK}" stroke-width="9" stroke-linecap="round"/>`,
  cyber: () => `
    <path d="M400 70l220 80v150c0 130-100 210-220 250C280 510 180 430 180 300V150z" fill="${WHITE}" ${S()}/>
    <path d="M400 120l170 62v118c0 100-76 164-170 196-94-32-170-96-170-196V182z" fill="${SAGE}" ${S(4)}/>
    <rect x="335" y="270" width="130" height="110" rx="18" fill="${INK}"/><path d="M360 270v-35a40 40 0 0 1 80 0v35" fill="none" ${S(14)}/>
    <circle cx="400" cy="322" r="14" fill="${YELLOW}"/><path d="M400 330v26" stroke="${YELLOW}" stroke-width="9" stroke-linecap="round"/>
    ${star(660, 140, 52, ORANGE, 10)}<path d="M638 142h44M660 120v44" ${S(7)}/>`,
  career: () => `
    <rect x="140" y="230" width="520" height="290" rx="34" fill="${TAN}" ${S()}/>
    <path d="M320 230v-40a24 24 0 0 1 24-24h112a24 24 0 0 1 24 24v40" fill="none" ${S(14)}/>
    <path d="M140 340h520" ${S()}/><rect x="360" y="320" width="80" height="54" rx="12" fill="${YELLOW}" ${S()}/>
    ${star(610, 150, 62, PINK, 12)}<text x="610" y="162" text-anchor="middle" font-family="Arial Black, Helvetica, sans-serif" font-size="34" fill="${INK}">HIRE</text>
    <path d="M200 440h120M200 475h80" stroke="${PEACH}" stroke-width="10" stroke-linecap="round"/>`,
  dance: () => `
    <circle cx="400" cy="300" r="210" fill="${PEACH}" ${S()}/>
    <g ${S()}><circle cx="330" cy="150" r="42" fill="${WHITE}"/><path d="M330 195l-20 120-70 80M310 315l70 90M320 225l-80 40M325 225l75-60" fill="none" stroke-width="22"/>
    <circle cx="520" cy="190" r="38" fill="${YELLOW}"/><path d="M520 232l20 100 60 70M540 332l-60 80M520 250l70-40M520 250l-70 20" fill="none" stroke-width="20"/></g>
    <g fill="${ORANGE}" ${S(4)}><path d="M120 460l60-22 6 62-30-4"/><circle cx="105" cy="470" r="16"/></g>
    ${star(670, 470, 54, SAGE, 10)}`,
  music: () => art.mic(),
};

const POSTERS = {
  'hackipu-2026': ['hackathon', PEACH], 'intro-to-rust': ['workshop', YELLOW], 'ml-study-jam': ['ml', SKY], 'design-sprint': ['design', PINK],
  'open-mic-night': ['mic', ORANGE], 'robotics-demo-day': ['robotics', SAGE], 'git-github-bootcamp': ['workshop', PEACH],
  'startup-pitch-night': ['pitch', YELLOW], 'photo-walk': ['photo', SKY], 'quiz-league': ['quiz', PINK], 'cyber-ctf': ['cyber', SAGE],
  'career-fair': ['career', PEACH], 'dance-fest': ['dance', ORANGE], 'pm-101-talk': ['talk', YELLOW], 'web3-workshop': ['workshop', SAGE],
};
for (const [slug, [kind, bg]] of Object.entries(POSTERS)) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600"><rect width="800" height="600" fill="${bg}"/>${dots(INK)}${art[kind]()}</svg>`;
  writeFileSync(join(out, `${slug}.svg`), svg);
}
console.log(`wrote ${Object.keys(POSTERS).length} posters to ${out}`);
