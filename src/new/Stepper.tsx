import { flow } from '../ui/copy-flow.ts'

export function Stepper({ step }: { step: 1 | 2 | 3 | 4 }) {
  return (
    <nav aria-label={flow.stepOf(step)} className="mb-8">
      <p className="mb-3 font-mono text-[0.75rem] uppercase tracking-[0.06em] text-fg-2">
        {flow.stepOf(step)}
      </p>
      <ol className="grid grid-cols-4 gap-px bg-line">
        {flow.steps.map((label, i) => (
          <li
            key={label}
            aria-current={i + 1 === step ? 'step' : undefined}
            className={`bg-bg px-2 py-2 text-sm ${i + 1 === step ? 'border-b-2 border-accent font-medium text-fg' : i + 1 < step ? 'text-fg' : 'text-fg-2'}`}
          >
            {label}
          </li>
        ))}
      </ol>
    </nav>
  )
}
