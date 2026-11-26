// What stands in for a screen that could not be shown: a link to no screen (app/+not-found),
// or a screen that threw (the ErrorBoundary of app/_layout and app/(tabs)/_layout). A short
// label, the heading, one sentence, the way on, and a reference for support: the address
// asked for, or the error's own words.
import { StyleSheet, View } from "react-native";

import { color, space } from "../theme";
import { Button, Screen, text } from "./controls";
import { Text } from "./text";

export function Fallback({
  testID,
  code,
  title,
  body,
  action,
  reference,
}: {
  testID: string;
  code: string;
  title: string;
  body: string;
  action: { label: string; onPress: () => void };
  // Shown after its label, which the caller writes in: "Reference: /crew/x".
  reference: string | null;
}) {
  return (
    <Screen testID={testID}>
      <View style={styles.column}>
        <Text style={text.label}>{code}</Text>
        <Text style={text.title} accessibilityRole="header">
          {title}
        </Text>
        <Text style={text.secondary}>{body}</Text>
        <Button
          testID={`${testID}-action`}
          label={action.label}
          onPress={action.onPress}
        />
        {reference !== null && (
          <Text style={[text.secondary, styles.reference]} selectable>
            {reference}
          </Text>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  column: { flex: 1, justifyContent: "center", gap: space[3] },
  reference: {
    marginTop: space[6],
    paddingTop: space[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border,
  },
});
