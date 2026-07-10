/**
 * @fileoverview The Quota Lab page's content: the guard-decision inputs
 * card and the estimator lab. Kept out of `app/**` (route shells are thin
 * composition only, per the coverage config) so it is unit tested
 * directly.
 *
 * @layer components/quota
 */
'use client'

import { useReducer } from 'react'

import { GuardInputsCard } from './GuardInputsCard'
import { LabRunner } from './LabRunner'

/** The Quota Lab page's guard-inputs card and estimator lab. */
export function QuotaPageContent(): React.JSX.Element {
  // GuardInputsCard owns its own balance fetch; remounting it on a
  // balance-changing lab action is simpler than lifting that fetch up.
  const [balanceKey, bumpBalanceKey] = useReducer((count: number) => count + 1, 0)

  return (
    <>
      <GuardInputsCard key={balanceKey} />
      <LabRunner onBalanceChanged={bumpBalanceKey} />
    </>
  )
}
