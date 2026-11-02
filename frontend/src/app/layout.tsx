import type { Metadata, Viewport } from 'next';
import './globals.css';
import SlowServerNotice from '@/components/SlowServerNotice';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl), // makes relative Open Graph image URLs absolute, which link previews require
  title: { default: 'SeatLock: events with seats that never oversell', template: '%s · SeatLock' },
  description: 'Publish an event, share one link, and fill every seat exactly once.',
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: [{ media: '(prefers-color-scheme: light)', color: '#ebe5e3' }, { media: '(prefers-color-scheme: dark)', color: '#1c1816' }] };

// Runs before first paint so a saved dark/light choice never flashes the wrong theme.
const themeInit = `try{var l=document.querySelector('link[data-late]');if(l){l.onload=function(){l.media='all'};if(l.sheet)l.media='all'}var t=localStorage.getItem('theme');if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t)}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://api.fontshare.com" />
        <link rel="preconnect" href="https://cdn.fontshare.com" crossOrigin="" />
        {/* Loaded without blocking the first paint: the page shows in a system serif at once and switches to Erode when it arrives. */}
        <link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=erode@400,401,500,600&display=swap" media="print" data-late />
        <noscript><link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=erode@400,401,500,600&display=swap" /></noscript>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:border-2 focus:border-[var(--ink-line)] focus:bg-surface focus:p-3">Skip to content</a>
        {children}
        <SlowServerNotice />
      </body>
    </html>
  );
}
