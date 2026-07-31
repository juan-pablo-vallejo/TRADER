import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { StatusBar } from "expo-status-bar";
import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import superjson from "superjson";

import { apiUrl, trpc } from "./src/api";
import { Clock } from "./src/Clock";
import type { PushFn } from "./src/db/sync";
import {
  DEV_SUBJECTS,
  DEV_SUBJECT_HEADER,
  initialSubject,
  type DevSubject,
} from "./src/dev-identity";

/**
 * The field client.
 *
 * Identity and the job list come from the server; **the labor does not.** Every
 * clock action writes to SQLite and returns, so a crew works a full day with no
 * signal and the outbox catches up later — SPEC §3's founding promise, and the
 * reason nothing below awaits the network before recording an event.
 *
 * Still unbuilt in this screen: passkey joining (`AUTH-1`–`AUTH-10`) and the
 * Face ID call itself, so events honestly record `none` for attestation.
 */
export default function App() {
  const [subject, setSubject] = useState<DevSubject | null>(initialSubject);

  const queryClient = useMemo(() => new QueryClient(), []);
  const trpcClient = useMemo(
    () =>
      trpc.createClient({
        links: [
          httpBatchLink({
            url: `${apiUrl}/api/trpc`,
            // Must match the server's transformer — see packages/api/src/trpc.ts
            // for why superjson is there. A mismatch fails silently.
            transformer: superjson,
            headers: () => (subject ? { [DEV_SUBJECT_HEADER]: subject } : {}),
          }),
        ],
      }),
    // Rebuilt when the subject changes so the header is re-read.
    [subject],
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <ScrollView contentContainerStyle={styles.screen}>
          <Text style={styles.title}>TRADER</Text>
          <Text style={styles.subtitle}>Phase 1 — offline clock in/out</Text>
          <Text style={styles.meta}>{apiUrl}</Text>

          <View style={styles.row}>
            {DEV_SUBJECTS.map((s) => (
              <Pressable
                key={s}
                onPress={() => {
                  queryClient.clear();
                  setSubject(s);
                }}
                style={[styles.button, subject === s && styles.buttonActive]}
              >
                <Text
                  style={[styles.buttonText, subject === s && styles.buttonTextActive]}
                >
                  {s}
                </Text>
              </Pressable>
            ))}
          </View>

          {subject ? (
            <Field />
          ) : (
            <Text style={styles.meta}>Choose an identity above.</Text>
          )}
          <StatusBar style="auto" />
        </ScrollView>
      </QueryClientProvider>
    </trpc.Provider>
  );
}

/**
 * Who is signed in, and the clock for their job.
 *
 * The identity and job list come from the server, but note what does *not*
 * depend on them: `Clock` writes to SQLite, so once a job id is known the crew
 * can work through a whole day with no connectivity at all.
 */
function Field() {
  const me = trpc.me.get.useQuery(undefined, { retry: false });
  const jobs = trpc.jobs.list.useQuery(undefined, { retry: false });
  const utils = trpc.useUtils();

  const push = useCallback<PushFn>(
    (batch) => utils.client.sync.push.mutate(batch),
    [utils],
  );

  if (me.isPending) return <Text style={styles.meta}>Loading…</Text>;
  if (me.error) return <Text style={styles.error}>{me.error.message}</Text>;

  // `address` is nullable in the schema, and a job without one is unidentifiable
  // to a worker — so prefer a named job, and fall back rather than showing blank.
  const job = jobs.data?.find((j) => j.address) ?? jobs.data?.[0];

  return (
    <View style={styles.card}>
      <Row label="Signed in" value={`${me.data.name} · ${me.data.role}`} />
      <Row
        label="Job"
        value={
          job?.address ??
          (job
            ? `Untitled job ${job.id.slice(0, 8)}`
            : "No active job — run pnpm db:seed")
        }
      />
      {job && <Clock jobId={job.id} push={push} />}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 24, paddingTop: 72, gap: 12 },
  title: { fontSize: 32, fontWeight: "700" },
  subtitle: { fontSize: 16, color: "#444" },
  meta: { fontSize: 13, color: "#777" },
  row: { flexDirection: "row", gap: 10, marginTop: 12 },
  button: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#bbb",
  },
  buttonActive: { backgroundColor: "#111", borderColor: "#111" },
  buttonText: { fontSize: 14, color: "#111" },
  buttonTextActive: { color: "#fff" },
  card: { marginTop: 16, gap: 10 },
  field: { gap: 2 },
  label: { fontSize: 12, textTransform: "uppercase", color: "#888", letterSpacing: 0.5 },
  value: { fontSize: 16 },
  error: { marginTop: 16, fontSize: 15, color: "#b00020" },
});
