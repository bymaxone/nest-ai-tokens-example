/**
 * @fileoverview The Tenants page's honest boundary statements (spec §18):
 * pricing is shared across tenants by design, and the default tenancy
 * mode is `required: false` (a `null` tenant is the global admin), an
 * e2e-only variant proving the `required: true` mode exists but is not
 * reachable from this demo's identity switcher.
 *
 * @layer components/tenants
 */

/** The Tenants page's honest boundary callouts. */
export function BoundaryCallouts(): React.JSX.Element {
  return (
    <div className="grid-2">
      <div className="toast toast--info" style={{ maxWidth: 'none' }}>
        <div style={{ width: '100%' }}>
          Pricing is intentionally shared across tenants: the price catalog carries no tenant id, so
          every tenant resolves the same rate for a given model.
        </div>
      </div>
      <div className="toast toast--info" style={{ maxWidth: 'none' }}>
        <div style={{ width: '100%' }}>
          Default tenancy mode is <code>required: false</code> (the "root" identity is the global,
          null-tenant admin). A <code>required: true</code> variant exists and is proven by an
          e2e-only boot; it is not reachable from this demo's identity switcher.
        </div>
      </div>
    </div>
  )
}
