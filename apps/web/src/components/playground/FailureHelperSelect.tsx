/**
 * @fileoverview The failure-marker helper: a picker over
 * `FAILURE_MARKERS` with a one-line explanation of what each marker
 * demonstrates, and a button that appends the selected marker to the
 * active card's input text.
 *
 * @layer components/playground
 */
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { FAILURE_MARKERS } from '@/lib/failure-markers'

/** The catalog's first marker, the picker's initial selection and non-null fallback. */
const FIRST_MARKER = FAILURE_MARKERS[0]!

/** FailureHelperSelect props. */
export interface FailureHelperSelectProps {
  /** Called with the selected marker's literal token, to append to the card's input. */
  readonly onInsert: (token: string) => void
  /** A stable id so a `<label htmlFor>` can target this control. */
  readonly id: string
}

/** A picker of `@@fail:*@@` markers plus an "Insert" action. */
export function FailureHelperSelect({ onInsert, id }: FailureHelperSelectProps): React.JSX.Element {
  const [selected, setSelected] = useState<string>(FIRST_MARKER.token)
  // Non-null: `selected` only ever holds a token rendered as one of the
  // <option> values below (the initial default, or a user pick from that
  // same list), so the lookup always succeeds.
  const marker = FAILURE_MARKERS.find((entry) => entry.token === selected)!

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Failure-marker helper</CardTitle>
        <CardDescription>
          Append a marker to trigger a documented failure path deterministically.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Label htmlFor={id} className="mb-1.5 block text-muted-foreground">
              Marker
            </Label>
            <select
              id={id}
              className="input"
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
            >
              {FAILURE_MARKERS.map((entry) => (
                <option key={entry.token} value={entry.token}>
                  {entry.token}
                </option>
              ))}
            </select>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => onInsert(selected)}>
            Insert into input
          </Button>
        </div>
        <p className="mt-2 text-[13px] text-muted-foreground">{marker.explanation}</p>
      </CardContent>
    </Card>
  )
}
