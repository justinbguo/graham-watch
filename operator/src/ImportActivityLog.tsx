import { useEffect, useRef } from 'react';

type Props = {
  lines: string[];
  title?: string;
  busy?: boolean;
  onClear?: () => void;
};

export function ImportActivityLog({ lines, title = 'Import log', busy = false, onClear }: Props) {
  const endRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    endRef.current?.lastElementChild?.scrollIntoView({ block: 'nearest' });
  }, [lines, busy]);

  if (lines.length === 0 && !busy) return null;

  return (
    <section className="import-activity" aria-live="polite" aria-busy={busy}>
      <header className="import-activity-header">
        <h2 className="import-activity-title">
          {title}
          {busy ? <span className="import-activity-pulse"> · working…</span> : null}
        </h2>
        {onClear && !busy && lines.length > 0 ? (
          <button type="button" className="ghost small" onClick={onClear}>
            Clear
          </button>
        ) : null}
      </header>
      <ol className="import-activity-lines" ref={endRef}>
        {lines.length === 0 && busy ? (
          <li className="muted">Waiting for the first update…</li>
        ) : (
          lines.map((line, index) => (
            <li key={`${index}-${line}`}>{line}</li>
          ))
        )}
      </ol>
    </section>
  );
}
