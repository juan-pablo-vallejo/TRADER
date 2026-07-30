import { MeCard } from "./me-card";

export default function Home() {
  return (
    <main style={{ maxWidth: "42rem" }}>
      <h1>TRADER</h1>
      <p>Phase 0 — the office web app, against the local stack.</p>
      <MeCard />
    </main>
  );
}

/**
 * The page renders a client component that queries on mount, so there is nothing
 * to prerender and a build-time render would only produce the signed-out state.
 */
export const dynamic = "force-dynamic";
