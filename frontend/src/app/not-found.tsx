import Link from 'next/link';
export default function NotFound() {
  return (
    <div className="mx-auto grid max-w-lg place-items-center py-20 text-center">
      <h1 className="display text-6xl">Nothing here</h1>
      <p className="mt-3 text-muted">That page does not exist, or you do not have access to it.</p>
      <p className="mt-8"><Link className="btn btn-primary btn-lg" href="/">Browse events</Link></p>
    </div>
  );
}
