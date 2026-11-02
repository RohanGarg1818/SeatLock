'use client';
import { useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';

// The QR is always black-on-white with a quiet zone, whatever the site theme: scanners need maximum contrast,
// and a dark-mode QR is much harder to read at the gate. We also ask the phone to keep the screen awake while the ticket is open.
export default function QrTicket({ token }: { token: string }) {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const request = async () => { try { lock = (await navigator.wakeLock?.request('screen')) ?? null; } catch { /* not supported or denied: fine */ } };
    request();
    const again = () => { if (!document.hidden) request(); };
    document.addEventListener('visibilitychange', again);
    return () => { document.removeEventListener('visibilitychange', again); lock?.release().catch(() => {}); };
  }, []);
  return (
    <div className="mx-auto w-full max-w-sm bg-white p-5" role="img" aria-label="Your ticket QR code. Show it to the volunteer at the gate.">
      <QRCodeSVG value={token} size={512} level="M" marginSize={2} bgColor="#ffffff" fgColor="#000000" style={{ width: '100%', height: 'auto' }} />
    </div>
  );
}
