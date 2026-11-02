// Optional email. Uses Resend's HTTP API through fetch (no extra dependency).
//
// Rules: email is a courtesy, never a requirement. It is sent AFTER the database commit, in the background, and a
// failure is logged and swallowed, so a mail outage can never fail a registration or leave a seat in limbo.
export function createMailer({ config, log }) {
  const cfg = config.mail;
  const web = config.webUrl || 'http://localhost:3000';

  async function send({ to, subject, text }) {
    if (!cfg) { log.debug('email skipped (not configured)', { subject }); return false; }
    try {
      const res = await fetch(cfg.apiUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: cfg.from, to: [to], subject, text }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) { log.warn('email provider refused', { status: res.status, subject }); return false; }
      return true;
    } catch (err) {
      log.warn('email failed', { err: err.message, subject });
      return false;
    }
  }

  // Fire and forget: callers do not await these.
  return {
    enabled: Boolean(cfg),
    send,
    ticketConfirmed({ to, name, eventTitle, bookingId }) {
      return send({ to, subject: `You're registered: ${eventTitle}`,
        text: `Hi ${name},\n\nYou are registered for ${eventTitle}.\nYour QR ticket: ${web}/me/tickets/${bookingId}\nShow it at the gate.\n\n- SeatLock` });
    },
    waitlistPromoted({ to, name, eventTitle, slug, minutes }) {
      return send({ to, subject: `A seat opened up: ${eventTitle}`,
        text: `Hi ${name},\n\nA seat opened up for ${eventTitle} and it is being held for you for ${minutes} minutes.\nFinish registering here: ${web}/e/${slug}\nIf you miss the window the seat goes to the next person.\n\n- SeatLock` });
    },
  };
}
