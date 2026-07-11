/**
 * @fileoverview The live result panel every command card shares: the
 * rendered content, the prompt/completion token split, the USD cost
 * breakdown, and a deep link into the Ledger's row inspector
 * (`/ledger?focus=<transactionId>`, scenario §13.1).
 *
 * @layer components/playground
 */
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
    <Card data-testid="result-panel">
      <CardHeader>
        <CardTitle className="text-base">Result</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <pre className="mono whitespace-pre-wrap text-[13px]">{content}</pre>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="font-mono">
            model: {usage.model}
          </Badge>
          <Badge variant="outline" className="font-mono">
            tokens: {usage.tokensUsed.input} in / {usage.tokensUsed.output} out /{' '}
            {usage.tokensUsed.total} total
          </Badge>
          <Badge variant="outline" className="font-mono">
            cost: {usage.cost.formatted}
          </Badge>
        </div>
        <Button asChild variant="outline" size="sm" className="mt-2 self-start">
          <a href={`/ledger?focus=${encodeURIComponent(usage.transactionId)}`}>View in Ledger</a>
        </Button>
      </CardContent>
    </Card>
  )
}
