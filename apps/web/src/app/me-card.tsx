"use client";

import { trpc } from "@/lib/trpc";

/**
 * Phase 0's done-criteria, on the web half: the signed-in caller's own record,
 * fetched **over HTTP** through the same route handler mobile calls. A server
 * component calling the router directly would prove the database path but skip
 * the transport, which is the half more likely to be wrong.
 */
export function MeCard() {
  const me = trpc.me.get.useQuery(undefined, { retry: false });

  if (me.isPending) return <p>Loading…</p>;

  if (me.error) {
    const unauthorized = me.error.data?.code === "UNAUTHORIZED";
    return (
      <div>
        <p>
          <strong>{unauthorized ? "Not signed in." : "Request failed."}</strong>{" "}
          {me.error.message}
        </p>
        {unauthorized && (
          <p>
            Sign in as <a href="/dev-signin?subject=dev_admin">dev_admin</a> or{" "}
            <a href="/dev-signin?subject=dev_worker_1">dev_worker_1</a>.
          </p>
        )}
      </div>
    );
  }

  return (
    <dl>
      <dt>Name</dt>
      <dd>{me.data.name}</dd>
      <dt>Role</dt>
      <dd>
        <strong>{me.data.role}</strong>
      </dd>
      <dt>Company</dt>
      <dd>
        <code>{me.data.companyId}</code>
      </dd>
      <dt>User id</dt>
      <dd>
        <code>{me.data.id}</code>
      </dd>
      <dt>Active</dt>
      <dd>{String(me.data.active)}</dd>
    </dl>
  );
}
