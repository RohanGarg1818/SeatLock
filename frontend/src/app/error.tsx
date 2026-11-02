'use client';
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto grid max-w-lg place-items-center py-20 text-center" role="alert">
      <h1 className="display text-6xl">Something broke</h1>
      <p className="mt-3 text-muted">The server did not answer properly. Your registrations are safe: seats are only ever taken by the server.</p>
      <p className="mt-8"><button className="btn btn-primary btn-lg" onClick={reset}>Try again</button></p>
    </div>
  );
}
