// Today. In this build: the jobsites the signed-in person may work on, read from the
// server's pull snapshot — the same read the clock will run on (TASKS R5). Loading, failed
// and empty are each said.
import { useCallback, useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { createApi, devHeaders } from "../../api";
import { apiUrl } from "../../config";
import { useStrings } from "../../i18n";
import { useSession } from "../../session";
import { color, size, space } from "../../theme";
import { Button, Screen, text } from "../../ui/controls";

type Job = { id: string; name: string; address: string | null };
type State =
  { status: "loading" } | { status: "failed" } | { status: "ready"; jobs: Job[] };

export default function Today() {
  const { t } = useStrings();
  const { session } = useSession();
  const [state, setState] = useState<State>({ status: "loading" });
  const email = session?.email;

  const load = useCallback(async () => {
    if (apiUrl === null || email === undefined) return;
    setState({ status: "loading" });
    try {
      const snapshot = await createApi(apiUrl, () => devHeaders(email)).sync.pull.query({
        protocolVersion: 1,
      });
      setState({
        status: "ready",
        jobs: snapshot.jobs
          .filter((job) => job.status !== "archived")
          .map((job) => ({ id: job.id, name: job.name, address: job.address })),
      });
    } catch {
      setState({ status: "failed" });
    }
  }, [email]);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Screen testID="today">
      <Text style={text.title}>{t.today.title}</Text>
      <Text style={text.label}>{t.today.jobs}</Text>
      {state.status === "loading" && (
        <Text testID="today-loading" style={text.body}>
          {t.loading}
        </Text>
      )}
      {state.status === "failed" && (
        <>
          <Text testID="today-failed" style={text.attention} accessibilityRole="alert">
            {t.today.loadFailed}
          </Text>
          <Button
            testID="today-retry"
            kind="secondary"
            label={t.retry}
            onPress={() => void load()}
          />
        </>
      )}
      {state.status === "ready" && state.jobs.length === 0 && (
        <Text testID="today-empty" style={text.body}>
          {t.today.noJobs}
        </Text>
      )}
      {state.status === "ready" && state.jobs.length > 0 && (
        <FlatList
          testID="job-list"
          data={state.jobs}
          keyExtractor={(job) => job.id}
          contentContainerStyle={styles.list}
          renderItem={({ item, index }) => (
            <View testID={`job-row-${index}`} style={styles.row}>
              <Text style={text.bodyStrong}>{item.name}</Text>
              {item.address !== null && (
                <Text style={text.secondary}>{item.address}</Text>
              )}
            </View>
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: space[2] },
  row: {
    minHeight: size.target,
    justifyContent: "center",
    padding: space[3],
    borderRadius: size.radiusCard,
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.border,
  },
});
