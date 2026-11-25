// A job, opened from its card on Today or from a shift on Week: its address, which opens
// the phone's own maps, and the office's notes. Both are the last pull's, so they are there
// with no signal.
import { Linking, Platform } from "react-native";

import { useStrings } from "../i18n";
import { mapsLink } from "../sync/today";
import { Button, text } from "./controls";
import { Sheet } from "./sheet";
import { Text } from "./text";

export type JobFacts = {
  id: string;
  name: string;
  address: string | null;
  notes: string | null;
};

export function JobSheet({
  job,
  onClose,
}: {
  job: JobFacts | null;
  onClose: () => void;
}) {
  const { t } = useStrings();
  return (
    <Sheet
      visible={job !== null}
      onClose={onClose}
      title={job?.name ?? ""}
      testID="job-sheet"
    >
      {job !== null && (
        <>
          <Text style={text.label}>{t.today.job.address}</Text>
          {job.address === null ? (
            <Text testID="job-no-address" style={text.secondary}>
              {t.today.job.noAddress}
            </Text>
          ) : (
            <>
              <Text testID="job-address" style={text.body} selectable>
                {job.address}
              </Text>
              <Button
                testID="job-maps"
                kind="secondary"
                label={t.today.job.openMaps}
                onPress={() =>
                  void Linking.openURL(mapsLink(job.address!, Platform.OS)).catch(
                    () => undefined,
                  )
                }
              />
            </>
          )}
          <Text style={text.label}>{t.today.job.notes}</Text>
          <Text
            testID="job-notes"
            style={job.notes === null ? text.secondary : text.body}
            selectable
          >
            {job.notes ?? t.today.job.noNotes}
          </Text>
        </>
      )}
      <Button
        testID="job-close"
        kind="secondary"
        label={t.today.job.close}
        onPress={onClose}
      />
    </Sheet>
  );
}
