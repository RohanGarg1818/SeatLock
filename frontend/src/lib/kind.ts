// Which kind of event a title describes (client-safe; the server side lives in photos.ts).
export type Kind = 'hackathon' | 'workshop' | 'mic' | 'robotics' | 'design' | 'ml' | 'talk';
export const KINDS: Kind[] = ['hackathon', 'workshop', 'mic', 'robotics', 'design', 'ml', 'talk'];

export function kindOf(title: string): Kind {
  const t = title.toLowerCase();
  if (/hack|ctf|code-?a-?thon/.test(t)) return 'hackathon';
  if (/robot|drone|iot|arduino/.test(t)) return 'robotics';
  if (/mic|music|band|night|dance|concert|fest/.test(t)) return 'mic';
  if (/design|sprint|ui|ux|figma/.test(t)) return 'design';
  if (/\bml\b|machine|learning|data|ai\b|study jam/.test(t)) return 'ml';
  if (/rust|workshop|bootcamp|intro|python|web|git/.test(t)) return 'workshop';
  return 'talk';
}


// The demo events have drawn posters in public/posters/<slug>.svg. The database keeps no banner for them (the API only accepts
// https banner URLs), so the website looks the poster up by slug. Events with a real uploaded banner always use that instead.
const POSTER_SLUGS = new Set(['hackipu-2026', 'intro-to-rust', 'ml-study-jam', 'design-sprint', 'open-mic-night', 'robotics-demo-day', 'git-github-bootcamp', 'startup-pitch-night', 'photo-walk', 'quiz-league', 'cyber-ctf', 'career-fair', 'dance-fest', 'pm-101-talk', 'web3-workshop']);
export const posterFor = (e: { banner_url: string | null; slug: string }): string | null => e.banner_url ?? (POSTER_SLUGS.has(e.slug) ? `/posters/${e.slug}.svg` : null);
