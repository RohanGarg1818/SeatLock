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
    <section className="mt-24 sm:mt-32" aria-labelledby="proof-h">
      <div className="relative mx-auto max-w-5xl rounded-[36px] border-2 border-ink-line bg-surface-2 px-5 py-12 text-[#141414] sm:px-12 sm:py-16">
        <h2 id="proof-h" className="display text-center text-4xl sm:text-6xl">1,000 clicks. 200 seats.<br />Nobody oversold.</h2>
        <p className="mx-auto mt-5 max-w-[56ch] text-center text-lg">We fired 1,000 simultaneous registrations at an event with 200 seats, once against a naive implementation and once against SeatLock.</p>

        <div className="mt-12 space-y-8">
          {ROWS.map((r) => (
            <div key={r.name} className="rounded-3xl border-2 border-[#141414] bg-white p-5 sm:p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-x-6">
                <p className="display text-xl sm:text-2xl">{r.name}</p>
                <p className="text-sm text-[#6a5648]">{r.note}</p>
              </div>
              <div className="relative mt-3 h-12 overflow-visible rounded-full border-2 border-[#141414] bg-[#fff1e8]" role="img" aria-label={`${r.booked} seats booked for ${CAPACITY} available`}>
                <div className={`flex h-full items-center justify-end rounded-full pr-4 ${r.over ? 'bg-[#e8883a]' : 'bg-[#8ec27a]'}`} style={{ width: `${(r.booked / MAX) * 100}%` }}>
                  <span className="value num text-xl">{r.booked} booked</span>
                </div>
                <span className="absolute -inset-y-2 w-1 rounded bg-[#141414]" style={{ left: `${(CAPACITY / MAX) * 100}%` }} aria-hidden />
              </div>
              <p className="mt-2 text-sm">{r.over ? <>200 seats. <b>342 people were promised a seat that did not exist.</b></> : <>200 seats. <b>Exactly 200 booked, every time.</b></>}</p>
            </div>
          ))}
        </div>
        <p className="mt-8 text-center text-sm text-[#6a5648]">Measured on a 2 vCPU test machine, results in docs/RESULTS.md. The naive count varies from run to run because it is a race; SeatLock&apos;s did not.</p>
      </div>
    </section>
  );
}
