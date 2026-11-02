import { ImageResponse } from 'next/og';
import { serverFetch } from '@/lib/server';
import type { PublicEvent } from '@/lib/types';
import { fmtDate, fmtTime, dayNum, monthShort } from '@/lib/format';

// Typographic share card (1200x630) for events without a banner image. Generated on demand for link previews.
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { data } = await serverFetch<{ event: PublicEvent }>(`/public/events/${encodeURIComponent(slug)}`);
  const e = data?.event;
  const title = e?.title ?? 'SeatLock';
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: '#17140f', color: '#f5f1e8', padding: 64 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 24 }}>
          <div style={{ fontSize: 220, lineHeight: 0.85, color: '#ff7a4d', fontWeight: 700 }}>{e ? dayNum(e.starts_at) : ''}</div>
          <div style={{ fontSize: 44, letterSpacing: 6, paddingBottom: 12 }}>{e ? monthShort(e.starts_at) : ''}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: title.length > 40 ? 64 : 84, fontWeight: 700, lineHeight: 1.05 }}>{title}</div>
          <div style={{ fontSize: 34, marginTop: 24, color: '#aaa292' }}>{e ? `${fmtDate(e.starts_at)}, ${fmtTime(e.starts_at)} · ${e.venue}` : ''}</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
