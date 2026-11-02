import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';

// The attendee website: public events, tickets, the volunteer scanner and the admin area.
// (Organizers have their own portal under /organizer with its own layout.)
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <main id="main" className="mx-auto w-full max-w-6xl px-4 pb-4 pt-8 sm:px-6">{children}</main>
      <Footer />
    </>
  );
}
