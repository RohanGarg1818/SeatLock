import type { Question } from '@/lib/types';

// Renders one registration question with a real <label>, required marker, and an error wired up via aria-describedby.
export default function QuestionField({ q, value, error, onChange }: { q: Question; value: unknown; error?: string; onChange: (v: unknown) => void }) {
  const id = `q-${q.id}`;
  const common = { id, name: q.id, 'aria-invalid': !!error, 'aria-describedby': error ? `${id}-err` : undefined, required: q.required && q.type !== 'checkbox' } as const;
  const label = <>{q.label}{q.required ? <span aria-hidden="true" className="text-accent-text"> *</span> : <span className="hint font-normal"> (optional)</span>}</>;
  let control: React.ReactNode;
  switch (q.type) {
    case 'long_text':
      control = <textarea {...common} className="field" maxLength={q.maxLength ?? 2000} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />; break;
    case 'select':
      control = (
        <select {...common} className="field" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)}>
          <option value="">Choose…</option>
          {q.options?.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ); break;
    case 'checkbox':
      return (
        <div>
          <label className="flex items-start gap-3">
            <input {...common} type="checkbox" className="mt-1 h-5 w-5 accent-[var(--accent)]" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
            <span className="font-semibold">{label}</span>
          </label>
          {error && <p id={`${id}-err`} className="err">{error}</p>}
        </div>
      );
    default: {
      const type = { text: 'text', email: 'email', phone: 'tel', number: 'number' }[q.type];
      control = <input {...common} type={type} inputMode={q.type === 'number' ? 'decimal' : undefined} autoComplete={q.type === 'email' ? 'email' : q.type === 'phone' ? 'tel' : 'off'} className="field" maxLength={q.type === 'number' ? undefined : q.maxLength ?? (q.type === 'text' ? 200 : undefined)} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />;
    }
  }
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      {control}
      {error && <p id={`${id}-err`} className="err">{error}</p>}
    </div>
  );
}
