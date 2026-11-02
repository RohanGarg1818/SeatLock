// Shown at once while a portal page loads, so a click never feels dead (the API may be waking up).
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-pulse space-y-4">
      <div className="h-10 w-1/3 rounded-[4px] bg-surface-2" />
      <div className="h-5 w-1/2 rounded-[4px] bg-surface-2" />
      <div className="mt-8 grid gap-4 sm:grid-cols-3"><div className="h-28 rounded-[4px] bg-surface-2" /><div className="h-28 rounded-[4px] bg-surface-2" /><div className="h-28 rounded-[4px] bg-surface-2" /></div>
      <div className="h-64 rounded-[4px] bg-surface-2" />
    </div>
  );
}
