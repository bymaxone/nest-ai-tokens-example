/**
 * @fileoverview The input state every command card shares: the free-text
 * body, the model override, a stable per-card `resourceId`, and the
 * failure-marker append action. Extracted once so the five command cards
 * do not each reimplement the same three pieces of local state.
 *
 * @layer components/playground
 */
import { useState } from 'react'

/** What {@link useCommandForm} returns. */
export interface CommandFormState {
  /** The command's free-text body. */
  readonly text: string
  /** Replaces the free-text body. */
  readonly setText: (value: string) => void
  /** The selected model override (empty until the user picks one or the catalog resolves a default). */
  readonly model: string
  /** Replaces the selected model. */
  readonly setModel: (value: string) => void
  /**
   * The model to submit with: the user's explicit pick, or the catalog's
   * first model once it has loaded. Callers disable submission while the
   * catalog is still loading (`models.length === 0`), so an empty result
   * here is never actually sent.
   *
   * @param models The command models catalog (empty while still loading).
   * @returns The model to send with the next request.
   */
  readonly effectiveModel: (models: readonly string[]) => string
  /** This card's stable resource correlation id. */
  readonly resourceId: string
  /** Appends a failure marker to the free-text body. */
  readonly appendMarker: (token: string) => void
}

/**
 * @param resourceId The stable `resourceId` this card correlates its calls under.
 * @returns The shared command-card input state.
 */
export function useCommandForm(resourceId: string): CommandFormState {
  const [text, setText] = useState('')
  const [model, setModel] = useState('')

  return {
    text,
    setText,
    model,
    setModel,
    effectiveModel: (models) => (model !== '' ? model : (models[0] ?? '')),
    resourceId,
    appendMarker: (token) => setText((current) => `${current} ${token}`.trim()),
  }
}
