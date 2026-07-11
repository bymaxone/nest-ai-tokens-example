/**
 * @fileoverview A controlled model-select, populated from
 * `GET /workspace/models`'s command model catalog. Purely presentational:
 * the Playground page fetches the catalog once and every command card
 * shares it, instead of each card issuing its own identical request.
 *
 * @layer components/playground
 */
import { Label } from '@/components/ui/label'

/** ModelPicker props. */
export interface ModelPickerProps {
  /** The command models the catalog offers (empty while the catalog is still loading). */
  readonly models: readonly string[]
  /** The selected model id. */
  readonly value: string
  /** Called with the newly selected model id. */
  readonly onChange: (model: string) => void
  /** A stable id so a `<label htmlFor>` can target this control. */
  readonly id: string
}

/** A labeled model select, sourced from the live models catalog. */
export function ModelPicker({ models, value, onChange, id }: ModelPickerProps): React.JSX.Element {
  return (
    <div>
      <Label htmlFor={id} className="mb-1.5 block text-muted-foreground">
        Model
      </Label>
      <select
        id={id}
        className="input"
        value={value}
        disabled={models.length === 0}
        onChange={(event) => onChange(event.target.value)}
      >
        {models.length === 0 ? (
          <option value="">Loading models…</option>
        ) : (
          models.map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))
        )}
      </select>
    </div>
  )
}
