// The service state a build asks for before it syncs, and what it sends to ask.
// Part of the client-safe contract.
import { z } from "zod";

// In order of restriction. `read_only`: pull only. `paused`: no sync. `update_required`: this
// build holds sync until it is updated; its outbox is pushed by the updated build.
export const STATES = ["normal", "read_only", "paused", "update_required"] as const;
export type ServiceState = (typeof STATES)[number];
export const PLATFORMS = ["ios", "android"] as const;

export const statusInput = z.object({
  protocolVersion: z.int().min(1),
  platform: z.enum(PLATFORMS),
  build: z.int().min(1),
});
export const statusOutput = z.strictObject({
  version: z.literal(1),
  state: z.enum(STATES),
});
