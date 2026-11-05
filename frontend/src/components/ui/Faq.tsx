const ITEMS = [
  ['Cost', 'Does it cost anything to register?', 'No. Registering for an event on SeatLock is free. You just need an account.'],
  ['Register', 'What happens when I click Register?', 'The seat is held for you for a few minutes (the organizer sets the length) while you answer any questions. Finish in time and the seat is yours; if the timer runs out, it goes back to the pool.'],
  ['Sold out', 'What if the event is sold out?', 'Join the waitlist. If someone cancels or their hold runs out, the seat is handed to the first person in line automatically, and you get a short window to finish registering.'],
  ['Fairness', 'Can two people end up with the same seat?', 'No. Taking a seat is a single database operation that checks and decrements the count in one step, so the number of tickets can never go above the number of seats, however many people click at once.'],
  ['The day', 'How do I get in on the day?', 'Open My tickets and show your QR code. A volunteer scans it at the gate; each ticket can be checked in only once, and a forged or edited code is rejected.'],
  ['Cancel', 'Can I cancel?', 'Yes, from My tickets, until you have checked in. Your seat then goes to the next person in line.'],
  ['Limits', 'Can organizers limit who joins?', 'Yes. An event can be limited to certain email domains, such as a college address, and can ask custom questions at registration.'],
] as const;

// Accordion rows like the reference: a white rounded row, the question on the left, a chevron that turns when it opens.
export default function Faq() {
  return (
    <div className="mx-auto max-w-3xl space-y-3">
      {ITEMS.map(([topic, q, a], i) => (
        <details key={q} className="group rounded-[28px] border-2 border-ink-line bg-card text-card-fg open:bg-surface-2 open:text-[#141414]" {...(i === 0 ? { open: true } : {})}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 marker:content-none [&::-webkit-details-marker]:hidden">
            <span><span className="sr-only">{topic}: </span><span className="text-[1.08rem] font-bold leading-snug sm:text-lg">{q}</span></span>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 transition-transform group-open:rotate-180" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
          </summary>
          <p className="max-w-none px-6 pb-6 text-[1.02rem]">{a}</p>
        </details>
      ))}
    </div>
  );
}
