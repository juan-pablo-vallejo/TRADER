// Which databases a promotion may speak to (ARCHITECTURE, 2026-11-16, endpoint pins). The
// two migrator strings are secrets nobody can read back, so each is held to an endpoint id
// the owner stated beside it: a string for another endpoint — production's, were one ever
// pasted — a pooled one, or the same one twice is refused before any statement is sent.
// Pure, and it answers in short tokens: never a host, a user or a string.
// Consumed by run-promotion.ts.
export type EndpointFault =
  | "staging_endpoint_not_stated"
  | "rehearsal_endpoint_not_stated"
  | "endpoints_equal"
  | "staging_url_unreadable"
  | "rehearsal_url_unreadable"
  | "staging_url_pooled"
  | "rehearsal_url_pooled"
  | "staging_url_on_another_endpoint"
  | "rehearsal_url_on_another_endpoint";

// Neon's endpoint id, as its console and API print it.
const ENDPOINT_ID = /^ep-[a-z0-9]+(-[a-z0-9]+)*$/;
const POOLED = "-pooler";

// The first label of a connection string's host: Neon's direct host is the endpoint id and
// then the region; its pooled host adds `-pooler` to that label.
function firstLabel(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") return null;
    const label = parsed.hostname.split(".")[0] ?? "";
    return label === "" ? null : label.toLowerCase();
  } catch {
    return null;
  }
}

function faultsOf(
  which: "staging" | "rehearsal",
  url: string,
  endpoint: string,
): EndpointFault[] {
  if (!ENDPOINT_ID.test(endpoint) || endpoint.endsWith(POOLED)) {
    return [`${which}_endpoint_not_stated`];
  }
  const label = firstLabel(url);
  if (label === null) return [`${which}_url_unreadable`];
  if (label === endpoint) return [];
  return [
    label === `${endpoint}${POOLED}`
      ? `${which}_url_pooled`
      : `${which}_url_on_another_endpoint`,
  ];
}

export function endpointFaults(input: {
  stagingUrl: string;
  rehearsalUrl: string;
  stagingEndpoint: string;
  rehearsalEndpoint: string;
}): EndpointFault[] {
  const staging = input.stagingEndpoint.trim();
  const rehearsal = input.rehearsalEndpoint.trim();
  return [
    ...faultsOf("staging", input.stagingUrl, staging),
    ...faultsOf("rehearsal", input.rehearsalUrl, rehearsal),
    // Stated the same, the rehearsal would be run on staging itself.
    ...(staging !== "" && staging === rehearsal ? (["endpoints_equal"] as const) : []),
  ];
}
