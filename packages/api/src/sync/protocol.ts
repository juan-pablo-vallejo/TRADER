// The sync protocol versions this server speaks (ARCHITECTURE, Sync protocol: a protocol version
// per request). Consumed by sync/push.ts and sync/pull.ts, which accept exactly these, and by
// status.ts, which tells a build outside them to update or to wait. A new version is appended;
// dropping the oldest is a decision, because it sends every build still on it to the store.
export const SYNC_PROTOCOL_VERSIONS = [1] as const;

export const SYNC_PROTOCOL = {
  min: Math.min(...SYNC_PROTOCOL_VERSIONS),
  max: Math.max(...SYNC_PROTOCOL_VERSIONS),
};
