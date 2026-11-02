import Icon from './Icon';
const ITEMS = [
  ['Does it cost anything to register?', 'No. Registering for an event on SeatLock is free. You just need an account.'],
  ['What happens when I click Register?', 'The seat is held for you for a few minutes (the organizer sets the length) while you answer any questions. Finish in time and the seat is yours; if the timer runs out, it goes back to the pool.'],
  ['What if the event is sold out?', 'Join the waitlist. If someone cancels or their hold runs out, the seat is handed to the first person in line automatically, and you get a short window to finish registering.'],
  ['Can two people end up with the same seat?', 'No. Taking a seat is a single database operation that checks and decrements the count in one step, so the number of tickets can never go above the number of seats, however many people click at once.'],
  ['How do I get in on the day?', 'Open My tickets and show your QR code. A volunteer scans it at the gate; each ticket can be checked in only once, and a forged or edited code is rejected.'],
  ['Can I cancel?', 'Yes, from My tickets, until you have checked in. Your seat then goes to the next person in line.'],
  ['Can organizers limit who joins?', 'Yes. An event can be limited to certain email domains, such as a college address, and can ask custom questions at registration.'],
] as const;

export default function Faq() {
  return (
    <div className="mx-auto max-w-3xl divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow)]">
      {ITEMS.map(([q, a], i) => (
        <details key={q} className="group" {...(i === 0 ? { open: true } : {})}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-left font-semibold marker:content-none hover:bg-surface-2 sm:px-6 sm:py-5 [&::-webkit-details-marker]:hidden">
            {q}<Icon name="chevron" className="shrink-0 text-muted transition-transform group-open:rotate-180" />
          </summary>
          <p className="px-5 pb-5 text-muted sm:px-6">{a}</p>
        </details>
      ))}
    </div>
  );
}
