'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/client';
import { fromLocalInput, toLocalInput } from '@/lib/format';
import type { OrganizerEvent, Question } from '@/lib/types';
import QuestionBuilder from '@/components/organizer/QuestionBuilder';

type Mode = 'offline' | 'online' | 'hybrid';
interface FormState {
  title: string; tagline: string; description_md: string; venue: string; mode: Mode;
  starts_at: string; ends_at: string; registration_opens_at: string; registration_closes_at: string;
  capacity: string; hold_minutes: string; domains: string; banner_url: string; questions: Question[];
}

const fromEvent = (e?: OrganizerEvent): FormState => ({
  title: e?.title ?? '', tagline: e?.tagline ?? '', description_md: e?.description_md ?? '', venue: e?.venue ?? '', mode: e?.mode ?? 'offline',
  starts_at: toLocalInput(e?.starts_at ?? null), ends_at: toLocalInput(e?.ends_at ?? null),
  registration_opens_at: toLocalInput(e?.registration_opens_at ?? null), registration_closes_at: toLocalInput(e?.registration_closes_at ?? null),
  capacity: String(e?.capacity ?? 50), hold_minutes: String(e?.hold_minutes ?? 5), domains: (e?.allowed_email_domains ?? []).join(', '),
  banner_url: e?.banner_url ?? '', questions: e?.registration_questions ?? [],
});

export default function EventForm({ event, locked = false, onSaved }: { event?: OrganizerEvent; locked?: boolean; onSaved?: (e: OrganizerEvent) => void }) {
  const router = useRouter();
  const [f, setF] = useState<FormState>(() => fromEvent(event));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [cloudinary, setCloudinary] = useState(false);
  const [uploading, setUploading] = useState(false);
  const originalIds = useRef(new Set((event?.registration_questions ?? []).map((q) => q.id)));
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => { setF((s) => ({ ...s, [k]: v })); setSaved(false); };

  // The poster uploader is enabled only when the API says Cloudinary is configured.
  useEffect(() => { api<{ cloudinary_enabled: boolean }>('/config').then((c) => setCloudinary(c.cloudinary_enabled)).catch(() => {}); }, []);

  async function upload(file: File) {
    if (!file.type.startsWith('image/')) { setError('Choose an image file (JPG, PNG or WebP).'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('That image is over 5 MB. Choose a smaller one.'); return; }
    setUploading(true); setError(null);
    try {
      const sig = await api<{ upload_url: string; api_key: string; timestamp: number; folder: string; signature: string }>('/uploads/sign', { method: 'POST', body: {} });
      const fd = new FormData();
      fd.append('file', file); fd.append('api_key', sig.api_key); fd.append('timestamp', String(sig.timestamp)); fd.append('folder', sig.folder); fd.append('signature', sig.signature);
      const res = await fetch(sig.upload_url, { method: 'POST', body: fd }); // straight from the browser to Cloudinary
      const json = await res.json();
      if (!res.ok || !json.secure_url) throw new Error(json.error?.message ?? 'Upload failed');
      set('banner_url', json.secure_url);
    } catch (e) { setError(e instanceof Error ? e.message : 'Upload failed'); }
    setUploading(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setFields({}); setSaved(false);
    const body: Record<string, unknown> = {
      title: f.title, tagline: f.tagline, description_md: f.description_md, venue: f.venue, mode: f.mode,
      starts_at: fromLocalInput(f.starts_at), ends_at: fromLocalInput(f.ends_at),
      registration_opens_at: fromLocalInput(f.registration_opens_at), registration_closes_at: fromLocalInput(f.registration_closes_at),
      hold_minutes: Number(f.hold_minutes),
      allowed_email_domains: f.domains.split(',').map((s) => s.trim().toLowerCase().replace(/^@/, '')).filter(Boolean),
      registration_questions: f.questions, banner_url: f.banner_url || null,
    };
    try {
      if (event) {
        const r = await api<{ event: OrganizerEvent }>(`/events/${event.id}`, { method: 'PATCH', body });
        setSaved(true); onSaved?.(r.event); router.refresh();
      } else {
        const r = await api<{ event: OrganizerEvent }>('/events', { body: { ...body, capacity: Number(f.capacity) } });
        router.push(`/organizer/events/${r.event.id}`);
        return;
      }
    } catch (err) {
      if (err instanceof ApiError) { setError(err.message); setFields(err.details?.fields ?? {}); } else setError('Something went wrong.');
    }
    setBusy(false);
  }

  const Err = ({ k }: { k: string }) => (fields[k] ? <p id={`${k}-err`} className="err">{fields[k]}</p> : null);
  const inv = (k: string) => ({ 'aria-invalid': !!fields[k], 'aria-describedby': fields[k] ? `${k}-err` : undefined });

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      {error && <p role="alert" className="card border-bad p-3 text-bad">{error}{Object.keys(fields).length > 0 && ': check the highlighted fields.'}</p>}
      {saved && <p role="status" className="card border-ok p-3 text-ok">Saved.</p>}

      <div><label className="label" htmlFor="title">Title</label><input id="title" className="field" required maxLength={150} value={f.title} onChange={(e) => set('title', e.target.value)} {...inv('title')} /><Err k="title" /></div>
      <div><label className="label" htmlFor="tagline">Tagline <span className="hint font-normal">(one line, shown under the title)</span></label><input id="tagline" className="field" maxLength={200} value={f.tagline} onChange={(e) => set('tagline', e.target.value)} {...inv('tagline')} /><Err k="tagline" /></div>
      <div>
        <label className="label" htmlFor="desc">Description <span className="hint font-normal">(Markdown: headings, lists, links, bold)</span></label>
        <textarea id="desc" className="field min-h-48 text-base" value={f.description_md} onChange={(e) => set('description_md', e.target.value)} {...inv('description_md')} /><Err k="description_md" />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div><label className="label" htmlFor="venue">Venue</label><input id="venue" className="field" required value={f.venue} onChange={(e) => set('venue', e.target.value)} {...inv('venue')} /><Err k="venue" /></div>
        <div><label className="label" htmlFor="mode">Format</label>
          <select id="mode" className="field" value={f.mode} onChange={(e) => set('mode', e.target.value as Mode)}><option value="offline">In person</option><option value="online">Online</option><option value="hybrid">Hybrid</option></select></div>
        <div><label className="label" htmlFor="starts">Starts</label><input id="starts" type="datetime-local" className="field" required value={f.starts_at} onChange={(e) => set('starts_at', e.target.value)} {...inv('starts_at')} /><Err k="starts_at" /></div>
        <div><label className="label" htmlFor="ends">Ends</label><input id="ends" type="datetime-local" className="field" required value={f.ends_at} onChange={(e) => set('ends_at', e.target.value)} {...inv('ends_at')} /><Err k="ends_at" /></div>
        <div><label className="label" htmlFor="ro">Registration opens</label><input id="ro" type="datetime-local" className="field" required value={f.registration_opens_at} onChange={(e) => set('registration_opens_at', e.target.value)} {...inv('registration_opens_at')} /><Err k="registration_opens_at" /></div>
        <div><label className="label" htmlFor="rc">Registration closes <span className="hint font-normal">(optional)</span></label><input id="rc" type="datetime-local" className="field" value={f.registration_closes_at} onChange={(e) => set('registration_closes_at', e.target.value)} {...inv('registration_closes_at')} /><Err k="registration_closes_at" /></div>
        {!event && <div><label className="label" htmlFor="cap">Capacity (seats)</label><input id="cap" type="number" min={1} max={100000} className="field" required value={f.capacity} onChange={(e) => set('capacity', e.target.value)} {...inv('capacity')} /><Err k="capacity" /></div>}
        <div><label className="label" htmlFor="hold">Seat hold (minutes)</label><input id="hold" type="number" min={1} max={60} className="field" value={f.hold_minutes} onChange={(e) => set('hold_minutes', e.target.value)} {...inv('hold_minutes')} /><p className="hint mt-1">How long a person has to finish the form.</p><Err k="hold_minutes" /></div>
      </div>
      <div><label className="label" htmlFor="dom">Allowed email domains <span className="hint font-normal">(optional, comma separated)</span></label><input id="dom" className="field" placeholder="ipu.ac.in, ggsipu.ac.in" value={f.domains} onChange={(e) => set('domains', e.target.value)} {...inv('allowed_email_domains')} /><p className="hint mt-1">Leave empty to allow anyone. Exact match: &quot;ipu.ac.in&quot; does not include subdomains.</p><Err k="allowed_email_domains" /></div>

      {(
        <div>
          <label className="label" htmlFor="banner">Event poster <span className="hint font-normal">(optional, a portrait or square image works best)</span></label>
          <input id="banner" type="file" accept="image/*" className="field" disabled={uploading || !cloudinary} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          {!cloudinary && <p className="hint mt-1">Poster uploads are switched off on this server. Add the CLOUDINARY_* keys to the API environment to turn them on.</p>}
          {uploading && <p className="hint mt-1">Uploading…</p>}
          {f.banner_url && <div className="mt-2 flex items-center gap-3">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={f.banner_url} alt="Poster preview" className="h-20 border border-line" /><button type="button" className="btn btn-sm" onClick={() => set('banner_url', '')}>Remove</button></div>}
          <Err k="banner_url" />
        </div>
      )}

      <QuestionBuilder value={f.questions} onChange={(q) => set('questions', q)} locked={locked} originalIds={originalIds.current} />
      <Err k="registration_questions" />

      <button className="btn btn-primary" disabled={busy || uploading}>{busy ? 'Saving…' : event ? 'Save changes' : 'Create draft'}</button>
    </form>
  );
}
