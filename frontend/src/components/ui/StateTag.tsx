import type { RegState } from '@/lib/types';
const LABEL: Record<RegState, string> = { OPEN: 'Open', NOT_OPEN: 'Opens soon', SOLD_OUT: 'Sold out', CLOSED: 'Closed', CANCELLED: 'Cancelled' };
const DOT: Record<RegState, string> = { OPEN: 'bg-ok', NOT_OPEN: 'bg-hold', SOLD_OUT: 'bg-bad', CLOSED: 'bg-muted', CANCELLED: 'bg-muted' };
export function StateTag({ state }: { state: RegState }) {
  return <span className="tag shrink-0 !bg-white !text-[#141414]"><span aria-hidden className={`h-2.5 w-2.5 rounded-full ${DOT[state]}`} />{LABEL[state]}</span>;
}
