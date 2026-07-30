import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { StatusBar } from "expo-status-bar";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import superjson from "superjson";

import { apiUrl, trpc } from "./src/api";
import {
  DEV_SUBJECTS,
  DEV_SUBJECT_HEADER,
  initialSubject,
  type DevSubject,
} from "./src/dev-identity";

/**
 * Phase 0's done-criteria, on the mobile half: a worker signs in and sees their
 * own role, resolved by the same API the office web app calls.
 *
 * Deliberately not offline-capable. `expo-sqlite`, the outbox and the sync
 * protocol are Phase 1 — the whole point of that phase. This screen only proves
 * the transport and the identity seam work from a phone.
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
          <Text style={styles.subtitle}>Phase 0 — field client, local stack</Text>
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

          {subject ? <Me /> : <Text style={styles.meta}>Choose an identity above.</Text>}
          <StatusBar style="auto" />
        </ScrollView>
      </QueryClientProvider>
    </trpc.Provider>
  );
}

function Me() {
  const me = trpc.me.get.useQuery(undefined, { retry: false });

  if (me.isPending) return <Text style={styles.meta}>Loading…</Text>;
  if (me.error) return <Text style={styles.error}>{me.error.message}</Text>;

  return (
    <View style={styles.card}>
      <Field label="Name" value={me.data.name} />
      <Field label="Role" value={me.data.role} />
      <Field label="Active" value={String(me.data.active)} />
      <Field label="User id" value={me.data.id} />
      <Field label="Company" value={me.data.companyId} />
    </View>
  );
}

function Field({ label, value }: { label: string; value: string }) {
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
