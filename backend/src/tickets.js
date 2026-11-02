// Signed QR tickets.
//
// token = base64url(JSON {bookingId, eventId}) + "." + base64url(HMAC-SHA256(secret, thatPayload))
//
// Why signed instead of a bare booking id? A bare id is guessable (1, 2, 3...): anyone could type
// numbers and walk in. A signature can only be produced by someone who knows TICKET_SECRET, so a
// forged or edited token fails verification BEFORE we touch the database.
import { createHmac, timingSafeEqual } from 'node:crypto';

const b64 = (buf) => Buffer.from(buf).toString('base64url');

const sign = (secret, payloadB64) => createHmac('sha256', secret).update(payloadB64).digest();

export function makeTicket(config, bookingId, eventId) {
  const payload = b64(JSON.stringify({ bookingId: String(bookingId), eventId: String(eventId) }));
  return `${payload}.${b64(sign(config.ticketSecret, payload))}`;
}

/** Returns { bookingId, eventId } if the signature is valid, otherwise null. Never throws. */
export function verifyTicket(config, token) {
  if (typeof token !== 'string' || token.length > 500) return null;
  const [payload, sig, ...extra] = token.split('.');
  if (!payload || !sig || extra.length) return null;
  const given = Buffer.from(sig, 'base64url');
  // Try the current secret, then the previous one (during rotation).
  for (const secret of [config.ticketSecret, config.ticketSecretPrevious].filter(Boolean)) {
    const expected = sign(secret, payload);
    // timingSafeEqual compares in constant time, so response timing cannot leak how many bytes matched.
    // (It throws on different lengths, so check length first.)
    if (given.length === expected.length && timingSafeEqual(given, expected)) {
      try {
        const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
        if (/^\d+$/.test(data.bookingId) && /^\d+$/.test(data.eventId)) return { bookingId: data.bookingId, eventId: data.eventId };
      } catch { /* fall through */ }
    }
  }
  return null;
}
