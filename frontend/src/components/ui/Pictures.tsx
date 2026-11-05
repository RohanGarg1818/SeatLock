// Pictures drawn from the subject itself: a hall's seat plan, a hold timer, a waiting line, a ticket's QR code.
// One flat graphic language, the page's own colours. They are drawings, not photographs, and are labelled as such by being plain.
const INK = '#111111', PAPER = '#f4efe9', GREEN = '#0f7d45', AMBER = '#c98a14', TAKEN = '#8a807b';

/** A seat plan of a hall: rows that curve, mostly taken, a few free, two held. Deterministic, so server and client agree. */
export function SeatPlan({ className = '', label = 'Seat plan of a hall, mostly taken, a few seats free' }: { className?: string; label?: string }) {
  const rows = 9, cols = 21;
  const seats: React.ReactNode[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = 40 + c * 34, y = 40 + r * 30 + Math.pow((c - 10) / 10, 2) * 26;
    const k = (r * 31 + c * 17 + (r * c) % 7) % 11;
    const fill = k === 0 || k === 5 ? GREEN : k === 3 && r % 2 ? AMBER : TAKEN;
    seats.push(<rect key={`${r}-${c}`} x={x} y={y} width={22} height={20} rx={3} fill={fill} />);
  }
  return <svg role="img" aria-label={label} viewBox="0 0 780 340" className={className}>{seats}</svg>;
}

/** A hold timer: a dial with the five minutes drawn as a wedge that is running out. */
export function HoldTimer({ className = '' }: { className?: string }) {
  return (
    <svg role="img" aria-label="A timer showing four minutes of a five minute hold left" viewBox="0 0 320 350" className={className}>
      <circle cx="160" cy="160" r="130" fill={PAPER} />
      <path d="M160 160 L160 30 A130 130 0 1 1 51 232 Z" fill={GREEN} />
      {Array.from({ length: 5 }, (_, i) => { const a = (i * 72 - 90) * Math.PI / 180; return <line key={i} x1={160 + Math.cos(a) * 112} y1={160 + Math.sin(a) * 112} x2={160 + Math.cos(a) * 130} y2={160 + Math.sin(a) * 130} stroke={INK} strokeWidth="5" />; })}
      <circle cx="160" cy="160" r="10" fill={INK} />
      <text x="160" y="340" textAnchor="middle" fontSize="38" fontWeight="600" fill="currentColor">4:12</text>
    </svg>
  );
}

/** A waiting line: people queued, the first one stepping up into a freed seat. */
export function Queue({ className = '' }: { className?: string }) {
  return (
    <svg role="img" aria-label="A line of people waiting, the first one moving into a free seat" viewBox="0 0 640 260" className={className}>
      <rect x="470" y="70" width="120" height="120" rx="6" fill={GREEN} />
      <text x="530" y="146" textAnchor="middle" fontSize="40" fontWeight="600" fill="#fff">Free</text>
      {Array.from({ length: 6 }, (_, i) => (
        <g key={i} transform={`translate(${40 + i * 66} 120)`}>
          <circle cx="24" cy="18" r="16" fill={i === 5 ? INK : PAPER} />
          <path d="M0 78c0-26 11-40 24-40s24 14 24 40z" fill={i === 5 ? INK : PAPER} />
        </g>
      ))}
      <path d="M420 150h36m-12-12 12 12-12 12" stroke={INK} strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A ticket with a QR-like code. The pattern is decorative (a real ticket's code is generated per booking). */
export function TicketArt({ className = '' }: { className?: string }) {
  const n = 17, cells: React.ReactNode[] = [];
  const inFinder = (x: number, y: number) => (x < 7 && y < 7) || (x > n - 8 && y < 7) || (x < 7 && y > n - 8);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (inFinder(x, y)) continue;
    if ((x * 7 + y * 13 + x * y) % 5 < 2) cells.push(<rect key={`${x}-${y}`} x={x * 14} y={y * 14} width="13" height="13" fill={INK} />);
  }
  const finder = (x: number, y: number) => (
    <g key={`f${x}${y}`} transform={`translate(${x * 14} ${y * 14})`}><rect width="97" height="97" fill={INK} /><rect x="14" y="14" width="69" height="69" fill={PAPER} /><rect x="28" y="28" width="41" height="41" fill={INK} /></g>
  );
  return (
    <svg role="img" aria-label="A ticket with a QR code" viewBox="0 0 460 280" className={className}>
      <rect width="460" height="280" rx="8" fill={PAPER} />
      <line x1="150" y1="14" x2="150" y2="266" stroke={INK} strokeWidth="4" strokeDasharray="2 10" strokeLinecap="round" />
      <text x="75" y="130" textAnchor="middle" fontSize="64" fontWeight="600" fill={INK}>11</text>
      <text x="75" y="168" textAnchor="middle" fontSize="24" fontWeight="600" fill={INK}>NOV</text>
      <g transform="translate(190 21)">{cells}{finder(0, 0)}{finder(n - 7, 0)}{finder(0, n - 7)}</g>
    </svg>
  );
}
