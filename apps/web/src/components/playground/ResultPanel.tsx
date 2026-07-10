/**
 * @fileoverview The live result panel every command card shares: the
 * rendered content, the prompt/completion token split, the USD cost
 * breakdown, and a deep link into the Ledger's row inspector
 * (`/ledger?focus=<transactionId>`, scenario §13.1).
 *
 * @layer components/playground
 */
import type { WorkspaceUsageView } from '@/lib/api-types'

/** ResultPanel props. */
export interface ResultPanelProps {
  /** The command's rendered content (already a display string, e.g. a joined translation list). */
  readonly content: string
  /** The metering summary the command response carried. */
  readonly usage: WorkspaceUsageView
}

/** The result panel: content, token split, cost breakdown, and the Ledger deep link. */
export function ResultPanel({ content, usage }: ResultPanelProps): React.JSX.Element {
  return (
    <div className="card" data-testid="result-panel">
      <div className="card__title">Result</div>
      <pre className="mono" style={{ whiteSpace: 'pre-wrap', fontSize: 13, margin: '8px 0' }}>
        {content}
      </pre>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <span className="chip mono">model: {usage.model}</span>
        <span className="chip mono">
          tokens: {usage.tokensUsed.input} in / {usage.tokensUsed.output} out /{' '}
          {usage.tokensUsed.total} total
        </span>
        <span className="chip mono">cost: {usage.cost.formatted}</span>
      </div>
      <a
        href={`/ledger?focus=${encodeURIComponent(usage.transactionId)}`}
        className="btn btn--outline btn--sm"
        style={{ marginTop: 12 }}
      >
        View in Ledger
      </a>
    </div>
  )
}
