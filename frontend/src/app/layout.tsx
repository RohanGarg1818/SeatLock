import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/fraunces/index.css';
import '@fontsource-variable/instrument-sans/index.css';
import './globals.css';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl), // makes relative Open Graph image URLs absolute, which link previews require
  title: { default: 'SeatLock: events with seats that never oversell', template: '%s · SeatLock' },
  description: 'Publish an event, share one link, and fill every seat exactly once.',
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: [{ media: '(prefers-color-scheme: light)', color: '#f6f6fb' }, { media: '(prefers-color-scheme: dark)', color: '#0b0b16' }] };

// Runs before first paint so a saved dark/light choice never flashes the wrong theme.
const themeInit = `try{var t=localStorage.getItem('theme');if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t)}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeInit }} /></head>
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:p-3 focus:shadow-lg">Skip to content</a>
        <Header />
        <main id="main" className="mx-auto w-full max-w-6xl px-4 pb-4 pt-8 sm:px-6">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
