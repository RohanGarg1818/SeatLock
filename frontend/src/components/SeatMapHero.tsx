// Decorative hero art: a theatre-style seat grid that fills in, and a floating ticket. Pure CSS, no data, hidden from screen readers.
const ROWS = 6, COLS = 10;
// Fixed pattern so server and client render identically: 0 = free, 1 = taken, 2 = held.
const PATTERN = [
  '1110011011', '1011110110', '1111011101', '0110111111', '1101111011', '0111010111',
];

function QrArt() {
  // A small deterministic QR-looking grid (decoration only; real tickets use a real QR encoder).
  const cells: boolean[] = [];
  let x = 7;
  for (let i = 0; i < 81; i++) { x = (x * 73 + 11) % 101; cells.push(x % 3 !== 0); }
  const finder = (r: number, c: number) => (r < 3 && c < 3) || (r < 3 && c > 5) || (r > 5 && c < 3);
  return (
    <div className="grid grid-cols-9 gap-[2px] rounded-lg bg-white p-2.5">
      {cells.map((on, i) => { const r = Math.floor(i / 9), c = i % 9; const f = finder(r, c);
        return <span key={i} className={`h-[7px] w-[7px] rounded-[1.5px] sm:h-[9px] sm:w-[9px] ${f || on ? 'bg-slate-900' : 'bg-transparent'}`} />; })}
    </div>
  );
}

export default function SeatMapHero() {
  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-[34rem]">
      <div className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-gradient-to-br from-accent/25 via-accent-2/15 to-warm/25 blur-3xl" />
      <div className="card overflow-hidden rounded-[1.75rem] p-5 shadow-[var(--shadow-lg)] sm:p-7">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="eyebrow">Live seat map</p>
            <p className="display mt-1 text-xl sm:text-2xl">Main Auditorium</p>
          </div>
          <span className="tag"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ok" />Registering now</span>
        </div>
        <div className="mx-auto mb-5 h-1.5 w-3/4 rounded-full bg-gradient-to-r from-transparent via-accent/60 to-transparent" />
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}>
          {Array.from({ length: ROWS * COLS }, (_, i) => {
            const r = Math.floor(i / COLS), c = i % COLS;
            const state = PATTERN[r][c] === '1' ? 'taken' : i % 11 === 4 ? 'held' : 'free';
            const cls = state === 'taken' ? 'bg-gradient-to-br from-accent to-accent-2' : state === 'held' ? 'bg-warm/80' : 'border border-line bg-surface-2';
            return <span key={i} className={`seat-pop aspect-square rounded-md sm:rounded-lg ${cls}`} style={{ animation: state === 'free' ? undefined : `seat-pop .5s ${(r * COLS + c) * 28}ms both cubic-bezier(.2,.8,.3,1)` }} />;
          })}
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted">
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-gradient-to-br from-accent to-accent-2" />Taken</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-warm/80" />Held for 5 min</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-line bg-surface-2" />Free</span>
        </div>
      </div>

      {/* floating ticket */}
      <div className="float-y absolute -bottom-10 -right-2 w-44 rounded-2xl border border-line bg-surface p-3 shadow-[var(--shadow-lg)] sm:-right-8 sm:w-52 sm:p-4" style={{ ['--r' as string]: '4deg' }}>
        <p className="eyebrow !text-[0.6rem]">Your ticket</p>
        <p className="display mt-1 text-base leading-tight">Seat confirmed</p>
        <div className="mt-2.5 flex justify-center"><QrArt /></div>
        <p className="mt-2 text-center text-[0.65rem] text-muted">Scan at the gate</p>
      </div>
      {/* floating hold chip */}
      <div className="float-y absolute -top-6 right-14 hidden rounded-2xl border border-line bg-surface px-4 py-3 shadow-[var(--shadow-lg)] sm:block" style={{ ['--r' as string]: '-3deg', animationDelay: '-2s' }}>
        <p className="text-[0.65rem] font-semibold uppercase tracking-widest text-muted">Seat held</p>
        <p className="display text-2xl text-warm">4:59</p>
      </div>
    </div>
  );
}
