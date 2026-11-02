const ITEMS = [
  ['Cost', 'Does it cost anything to register?', 'No. Registering for an event on SeatLock is free. You just need an account.'],
  ['Register', 'What happens when I click Register?', 'The seat is held for you for a few minutes (the organizer sets the length) while you answer any questions. Finish in time and the seat is yours; if the timer runs out, it goes back to the pool.'],
  ['Sold out', 'What if the event is sold out?', 'Join the waitlist. If someone cancels or their hold runs out, the seat is handed to the first person in line automatically, and you get a short window to finish registering.'],
  ['Fairness', 'Can two people end up with the same seat?', 'No. Taking a seat is a single database operation that checks and decrements the count in one step, so the number of tickets can never go above the number of seats, however many people click at once.'],
  ['The day', 'How do I get in on the day?', 'Open My tickets and show your QR code. A volunteer scans it at the gate; each ticket can be checked in only once, and a forged or edited code is rejected.'],
  ['Cancel', 'Can I cancel?', 'Yes, from My tickets, until you have checked in. Your seat then goes to the next person in line.'],
  ['Limits', 'Can organizers limit who joins?', 'Yes. An event can be limited to certain email domains, such as a college address, and can ask custom questions at registration.'],
] as const;

// Index cards: each question is a filled card, the topic sits on a tab, and a card opens in place.
const TONES = ['bg-surface', 'bg-surface-2'];
export default function Faq() {
  return (
    <div className="max-w-3xl space-y-3">
      {ITEMS.map(([topic, q, a], i) => (
        <details key={q} className="group reveal" {...(i === 0 ? { open: true } : {})}>
          <summary className="block cursor-pointer list-none marker:content-none [&::-webkit-details-marker]:hidden">
            <span className={`${TONES[i % 2]} inline-block min-w-28 px-4 py-1.5 text-[0.95rem] font-semibold [clip-path:polygon(0_0,calc(100%-14px)_0,100%_100%,0_100%)]`} style={{ marginLeft: `${(i % 4) * 2}rem` }}>{topic}</span>
            <span className={`${TONES[i % 2]} block rounded-b-[4px] rounded-tr-[4px] px-5 py-4 text-xl font-medium transition-colors hover:brightness-95 group-open:rounded-b-none`}>{q}</span>
          </summary>
          <p className={`${TONES[i % 2]} max-w-none rounded-b-[4px] px-5 pb-5`}>{a}</p>
        </details>
      ))}
    </div>
  );
}
