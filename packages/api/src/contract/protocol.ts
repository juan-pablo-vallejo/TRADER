// The sync protocol versions this build speaks (ARCHITECTURE, Sync protocol). Part of the
// client-safe contract: zod only, nothing of the server.
export const SYNC_PROTOCOL_VERSIONS = [1] as const;

export const SYNC_PROTOCOL = {
  min: Math.min(...SYNC_PROTOCOL_VERSIONS),
  max: Math.max(...SYNC_PROTOCOL_VERSIONS),
};
