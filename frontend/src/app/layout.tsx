import type { Metadata, Viewport } from 'next';
import './globals.css';
import SlowServerNotice from '@/components/ui/SlowServerNotice';
import Warmup from '@/components/ui/Warmup';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl), // makes relative Open Graph image URLs absolute, which link previews require
  title: { default: 'SeatLock: hold your seat at every campus event', template: '%s · SeatLock' },
  description: 'Publish an event, share one link, and fill every seat exactly once.',
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: [{ media: '(prefers-color-scheme: light)', color: '#fff1e8' }, { media: '(prefers-color-scheme: dark)', color: '#1a1310' }] };

// Runs before first paint so a saved dark/light choice never flashes the wrong theme.
const themeInit = `try{var l=document.querySelector('link[data-late]');if(l){l.onload=function(){l.media='all'};if(l.sheet)l.media='all'}var t=localStorage.getItem('theme');if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t)}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* Loaded without blocking the first paint: the page shows in a fallback font at once and switches to Bricolage Grotesque, DM Sans and Anton when it arrives. */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton&family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=DM+Sans:wght@400;500;700&display=swap" media="print" data-late />
        <noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton&family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=DM+Sans:wght@400;500;700&display=swap" /></noscript>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-full focus:border-2 focus:border-[var(--ink-line)] focus:bg-surface focus:px-4 focus:py-2">Skip to content</a>
        {children}
        <SlowServerNotice />
        <Warmup />
      </body>
    </html>
  );
}
