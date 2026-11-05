'use client';
import type { Question, QuestionType } from '@/lib/types';

const TYPES: { value: QuestionType; label: string }[] = [
  { value: 'text', label: 'Short text' }, { value: 'long_text', label: 'Long text' }, { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' }, { value: 'number', label: 'Number' }, { value: 'select', label: 'Choose one (dropdown)' }, { value: 'checkbox', label: 'Checkbox' },
];
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24);

// Question ids are what answers are stored under, so an id is generated once from the label and never changes afterwards.
export default function QuestionBuilder({ value, onChange, locked, originalIds }: { value: Question[]; onChange: (q: Question[]) => void; locked: boolean; originalIds: Set<string> }) {
  const set = (i: number, patch: Partial<Question>) => onChange(value.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const move = (i: number, d: -1 | 1) => { const j = i + d; if (j < 0 || j >= value.length) return; const c = [...value]; [c[i], c[j]] = [c[j], c[i]]; onChange(c); };
  const add = () => {
    let id = 'question'; let n = 1;
    while (value.some((q) => q.id === id)) id = `question_${++n}`;
    onChange([...value, { id, type: 'text', label: '', required: false }]);
  };
  return (
    <fieldset className="space-y-4">
      <legend className="label">Registration questions <span className="hint font-normal">({value.length}/15)</span></legend>
      {locked && <p className="card p-3 text-sm" role="note">People have already registered, so existing questions can&apos;t be removed or made required, and new questions must be optional. This keeps existing answers valid.</p>}
      {value.map((q, i) => {
        const existing = originalIds.has(q.id);
        const fixed = locked && existing;
        // key={i}, not the id: the id is derived from the label and changes as you type, which would remount the input and drop focus.
        return (
          <div key={i} className="card p-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
              <div>
                <label className="label" htmlFor={`ql-${i}`}>Question {i + 1}</label>
                <input id={`ql-${i}`} className="field" value={q.label} maxLength={200} placeholder="e.g. Enrollment number"
                  onChange={(e) => { const label = e.target.value; const patch: Partial<Question> = { label }; if (!existing && !value.some((x, j) => j !== i && x.id === slug(label)) && slug(label)) patch.id = slug(label); set(i, patch); }} />
              </div>
              <div>
                <label className="label" htmlFor={`qt-${i}`}>Type</label>
                <select id={`qt-${i}`} className="field" value={q.type} disabled={fixed}
                  onChange={(e) => { const type = e.target.value as QuestionType; set(i, { type, options: type === 'select' ? q.options ?? ['Option 1'] : undefined }); }}>
                  {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            </div>
            {q.type === 'select' && (
              <div className="mt-3">
                <label className="label" htmlFor={`qo-${i}`}>Options <span className="hint font-normal">(comma separated)</span></label>
                <input id={`qo-${i}`} className="field" value={(q.options ?? []).join(', ')} onChange={(e) => set(i, { options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
              </div>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2">
                <input type="checkbox" className="h-5 w-5 accent-[var(--accent)]" checked={q.required} disabled={locked && (!existing || !q.required ? !existing : false)}
                  onChange={(e) => set(i, { required: e.target.checked })} /> Required
              </label>
              <div className="ml-auto flex gap-2">
                <button type="button" className="btn btn-sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move question ${i + 1} up`}>↑</button>
                <button type="button" className="btn btn-sm" onClick={() => move(i, 1)} disabled={i === value.length - 1} aria-label={`Move question ${i + 1} down`}>↓</button>
                <button type="button" className="btn btn-sm btn-danger" onClick={() => onChange(value.filter((_, j) => j !== i))} disabled={fixed} aria-label={`Remove question ${i + 1}`}>Remove</button>
              </div>
            </div>
          </div>
        );
      })}
      <button type="button" className="btn btn-sm" onClick={add} disabled={value.length >= 15}>Add a question</button>
    </fieldset>
  );
}
