// The one claim the product stands on, shown as a picture: the same 1,000 clicks on a 200-seat event, handled two ways.
// The numbers are real, measured with `npm run race-demo -- --capacity 200 --requests 1000` (see docs/RESULTS.md).
const MAX = 542;
const CAPACITY = 200;
const ROWS = [
  { name: 'A naive booking system', note: 'reads the count, then writes it back', booked: 542, over: true },
  { name: 'SeatLock', note: 'checks and takes the seat in one database step', booked: 200, over: false },
];

export default function Proof() {
  return (
    <section className="bleed mt-20 bg-[#2b2622] py-16 text-[#f6f2f0] sm:mt-28 sm:py-24" aria-labelledby="proof-h">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <h2 id="proof-h" className="display reveal text-4xl sm:text-6xl">1,000 clicks. 200 seats.<br />Nobody oversold.</h2>
        <p className="reveal mt-5 max-w-[52ch] text-lg">We fired 1,000 simultaneous registrations at an event with 200 seats, once against a naive implementation and once against SeatLock.</p>

        <div className="reveal mt-12 space-y-8">
          {ROWS.map((r) => (
            <div key={r.name}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-6">
                <p className="display text-2xl sm:text-3xl">{r.name}</p>
                <p className="opacity-80">{r.note}</p>
              </div>
              <div className="relative mt-3 h-14 bg-[#3a342f]" role="img" aria-label={`${r.booked} seats booked for ${CAPACITY} available`}>
                <div className={`flex h-full items-center justify-end pr-3 ${r.over ? 'bg-[#c2410c]' : 'bg-[#0f7d45]'}`} style={{ width: `${(r.booked / MAX) * 100}%` }}>
                  <span className="display num text-2xl">{r.booked} booked</span>
                </div>
                <span className="absolute inset-y-0 w-1 bg-[#f6f2f0]" style={{ left: `${(CAPACITY / MAX) * 100}%` }} aria-hidden />
              </div>
              <p className="mt-2 text-sm opacity-80" style={{ paddingLeft: `calc(${(CAPACITY / MAX) * 100}% - 3.5rem)` }}>
                {r.over ? <>200 seats. <b>342 people were promised a seat that did not exist.</b></> : <>200 seats. <b>Exactly 200 booked, every time.</b></>}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-10 text-sm opacity-70">Measured on a 2 vCPU test machine, results in docs/RESULTS.md. The naive count varies from run to run because it is a race; SeatLock&apos;s did not.</p>
      </div>
    </section>
  );
}
