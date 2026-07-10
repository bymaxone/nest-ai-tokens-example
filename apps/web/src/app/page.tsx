/**
 * @fileoverview Temporary root route proving the ported design tokens
 * render correctly (background, typography, glass card). Replaced by the
 * dashboard shell redirect once the shell and its routes land.
 *
 * @layer app/page
 */

/**
 * Renders one glass card with the brand heading to prove the token port.
 *
 * @returns The proof-of-tokens page.
 */
export default function RootPage(): React.JSX.Element {
  return (
    <main style={{ padding: 48 }}>
      <div className="card card--accent" style={{ maxWidth: 420 }}>
        <div className="card__title">nest-ai-tokens-example</div>
        <div className="card__desc">Design tokens ported from design_system.html.</div>
      </div>
    </main>
  )
}
