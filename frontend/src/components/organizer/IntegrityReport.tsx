import Icon from '@/components/ui/Icon';
import type { IntegrityReport as Report } from '@/lib/types';

// Verdict + one row per rule. Every rule is written in plain words so a red row explains itself.
export default function IntegrityReport({ report }: { report: Report }) {
  const failed = report.checks.filter((c) => !c.ok).length;
  return (
    <div aria-live="polite">
      <p className={`display text-3xl ${report.ok ? 'text-ok' : 'text-bad'}`} data-testid="integrity-verdict">
        {report.ok ? `All ${report.checks.length} checks passed` : `${failed} of ${report.checks.length} checks FAILED`}
      </p>
      <ul className="mt-4 space-y-1.5 [&>li]:rounded-[4px] [&>li]:bg-surface-2 [&>li]:px-3">
        {report.checks.map((c) => (
          <li key={c.id} className="grid gap-1 p-3 sm:grid-cols-[2rem_1fr_auto] sm:gap-3">
            <span aria-hidden className={`display text-xl ${c.ok ? 'text-ok' : 'text-bad'}`}>{c.skipped ? '–' : <Icon name={c.ok ? 'check' : 'close'} size={20} />}</span>
            <div>
              <p className="font-semibold">{c.title}<span className="sr-only">: {c.skipped ? 'skipped' : c.ok ? 'passed' : 'failed'}</span></p>
              <p className="hint"><code>{c.rule}</code></p>
            </div>
            <p className="text-sm text-muted sm:text-right">expected <b className="text-fg">{String(c.expected)}</b><br />found <b className={c.ok ? 'text-fg' : 'text-bad'}>{String(c.actual)}</b></p>
          </li>
        ))}
      </ul>
    </div>
  );
}
