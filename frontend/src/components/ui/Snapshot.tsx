import type { Kind } from '@/lib/kind';

// A rounded, outlined poster frame. If the organizer uploaded a poster, or a real photo exists for the kind of event, it is shown;
// otherwise a flat drawn scene stands in, so the page never has an empty frame.
const BG: Record<Kind, string> = { hackathon: '#fdd4b6', workshop: '#f4c542', mic: '#e8883a', robotics: '#c5dba8', design: '#f6a9b8', ml: '#a9c8f0', talk: '#f4c542' };

function Scene({ kind }: { kind: Kind }) {
  const ink = '#141414', paper = '#ffffff';
  const shapes: Record<Kind, React.ReactNode> = {
    hackathon: <><rect x="22" y="34" width="76" height="48" rx="4" fill={paper} stroke={ink} strokeWidth="4" /><rect x="10" y="86" width="100" height="8" rx="3" fill={ink} /><path d="M34 48h30M34 58h46M34 68h22" stroke={ink} strokeWidth="5" strokeLinecap="round" /></>,
    workshop: <><rect x="12" y="30" width="44" height="34" rx="3" fill={paper} stroke={ink} strokeWidth="4" /><rect x="64" y="30" width="44" height="34" rx="3" fill={paper} stroke={ink} strokeWidth="4" /><path d="M34 64v14M86 64v14M24 82h20M76 82h20" stroke={ink} strokeWidth="4" strokeLinecap="round" /><circle cx="34" cy="97" r="7" fill={ink} /><circle cx="86" cy="97" r="7" fill={ink} /></>,
    mic: <><path d="M60 8 24 108h72z" fill={paper} opacity=".35" /><rect x="50" y="34" width="20" height="34" rx="10" fill={ink} /><path d="M40 58a20 20 0 0 0 40 0M60 78v22M44 102h32" stroke={ink} strokeWidth="5" strokeLinecap="round" fill="none" /></>,
    robotics: <><rect x="28" y="36" width="64" height="50" rx="8" fill={paper} stroke={ink} strokeWidth="4" /><circle cx="46" cy="58" r="8" fill={ink} /><circle cx="74" cy="58" r="8" fill={ink} /><path d="M46 76h28M60 36V22" stroke={ink} strokeWidth="4" strokeLinecap="round" /><circle cx="60" cy="18" r="5" fill={ink} /><rect x="38" y="90" width="44" height="14" rx="3" fill={ink} /></>,
    design: <><rect x="12" y="16" width="44" height="44" fill={paper} stroke={ink} strokeWidth="3" transform="rotate(-6 34 38)" /><rect x="64" y="22" width="44" height="44" fill="#f5a3b7" stroke={ink} strokeWidth="3" transform="rotate(5 86 44)" /><rect x="30" y="66" width="44" height="44" fill="#a9c4a0" stroke={ink} strokeWidth="3" transform="rotate(-3 52 88)" /></>,
    ml: <><path d="M24 30 60 60 96 30M24 90 60 60 96 90M24 30v60M96 30v60" stroke={paper} strokeWidth="3" fill="none" /><g fill={paper} stroke={ink} strokeWidth="3"><circle cx="24" cy="30" r="10" /><circle cx="24" cy="90" r="10" /><circle cx="96" cy="30" r="10" /><circle cx="96" cy="90" r="10" /><circle cx="60" cy="60" r="13" /></g></>,
    talk: <><rect x="44" y="52" width="32" height="48" rx="3" fill={ink} /><circle cx="60" cy="38" r="12" fill={paper} stroke={ink} strokeWidth="4" /><g fill={ink}><circle cx="16" cy="100" r="8" /><circle cx="36" cy="106" r="8" /><circle cx="84" cy="106" r="8" /><circle cx="104" cy="100" r="8" /></g></>,
  };
  return <svg viewBox="0 0 120 120" preserveAspectRatio="xMidYMid slice" className="h-full w-full" aria-hidden="true"><rect width="120" height="120" fill={BG[kind]} />{shapes[kind]}</svg>;
}

export default function Snapshot({ src, kind, alt = '', className = '', priority = false, ratio = 'aspect-[4/3]' }: { src?: string | null; kind: Kind; alt?: string; rotate?: number; className?: string; priority?: boolean; ratio?: string }) {
  return (
    <span className={`snap ${ratio} ${className}`}>
      {src
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={src} alt={alt} className="h-full w-full object-cover" loading={priority ? 'eager' : 'lazy'} />
        : <span className="snap-art block h-full w-full"><Scene kind={kind} /></span>}
    </span>
  );
}
