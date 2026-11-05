import { ImageResponse } from 'next/og';

// The picture shown when the site's link is shared (event pages have their own, under /e/[slug]/og).
export const alt = 'SeatLock: pick an event, keep your seat';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: '#fdd4b6', color: '#141414', padding: 72 }}>
        <div style={{ display: 'flex', gap: 14 }}>
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => <div key={i} style={{ width: 44, height: 44, borderRadius: 12, border: '3px solid #141414', background: i === 6 ? '#e8883a' : i % 3 === 0 ? '#f4c542' : '#ffffff' }} />)}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 112, lineHeight: 1.02, fontWeight: 700 }}>Pick an event.</div>
          <div style={{ fontSize: 112, lineHeight: 1.02, fontWeight: 700 }}>Keep your seat.</div>
          <div style={{ fontSize: 36, marginTop: 28, color: '#6a5648' }}>SeatLock · campus events where no seat is ever sold twice</div>
        </div>
      </div>
    ),
    size,
  );
}
