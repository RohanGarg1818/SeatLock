import type { RegState } from '@/lib/types';
const LABEL: Record<RegState, string> = { OPEN: 'Open', NOT_OPEN: 'Opens soon', SOLD_OUT: 'Sold out', CLOSED: 'Closed', CANCELLED: 'Cancelled' };
const DOT: Record<RegState, string> = { OPEN: 'bg-ok', NOT_OPEN: 'bg-accent', SOLD_OUT: 'bg-bad', CLOSED: 'bg-muted', CANCELLED: 'bg-muted' };
export function StateTag({ state }: { state: RegState }) {
  return <span className="tag shrink-0"><span aria-hidden className={`h-1.5 w-1.5 rounded-full ${DOT[state]}`} />{LABEL[state]}</span>;
}
