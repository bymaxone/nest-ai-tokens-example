/**
 * @fileoverview Playground page: the five workspace command cards, the
 * embeddings panel, and the honest streaming-scope note. The command
 * models catalog (`GET /workspace/models`) is fetched once here and
 * shared by every card, instead of each card issuing its own request.
 *
 * @layer app/(dashboard)/playground
 */
'use client'

import { ErrorBanner } from '@/components/common/ErrorBanner'
import { AnalyzeCard } from '@/components/playground/AnalyzeCard'
import { CustomCard } from '@/components/playground/CustomCard'
import { EmbeddingsPanel } from '@/components/playground/EmbeddingsPanel'
import { RewriteCard } from '@/components/playground/RewriteCard'
import { SummarizeCard } from '@/components/playground/SummarizeCard'
import { TranslateCard } from '@/components/playground/TranslateCard'
import { PageScaffold } from '@/components/shell/PageScaffold'
import { requireNavItem } from '@/components/shell/nav-items'
import { api } from '@/lib/api'
import { useApiQuery } from '@/lib/use-api-query'

const NAV_ITEM = requireNavItem('/playground')

/** The Playground page. */
export default function PlaygroundPage(): React.JSX.Element {
  const { state } = useApiQuery(() => api.getModels())
  const models = state.status === 'ready' ? state.data.command.models : []

  return (
    <PageScaffold title={NAV_ITEM.label} description={NAV_ITEM.description}>
      <div className="toast toast--info" style={{ maxWidth: 'none' }}>
        Response streaming is out of the library's v1 scope; every command below returns its full
        result in one response.
      </div>

      {state.status === 'error' && <ErrorBanner error={state.error} />}

      <div className="grid-2">
        <TranslateCard models={models} />
        <SummarizeCard models={models} />
        <RewriteCard models={models} />
        <AnalyzeCard models={models} />
      </div>
      <CustomCard models={models} />
      <EmbeddingsPanel />
    </PageScaffold>
  )
}
