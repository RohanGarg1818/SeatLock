import Link from 'next/link';
import Icon from '@/components/Icon';
export default function NotFound() {
  return (
    <div className="mx-auto grid max-w-lg place-items-center py-20 text-center">
      <span className="grid h-16 w-16 place-items-center rounded-2xl bg-surface-2 text-accent-text ring-1 ring-line"><Icon name="search" size={28} /></span>
      <h1 className="display mt-6 text-5xl">Nothing here</h1>
      <p className="mt-3 text-muted">That page does not exist, or you do not have access to it.</p>
      <p className="mt-8"><Link className="btn btn-primary btn-lg" href="/">Browse events</Link></p>
    </div>
  );
}
