// A sheet from the bottom of the screen: one question, or one thing's details, over the
// screen that asked. The system's own modal, so the Android back button and a screen
// reader's escape close it; a tap on the dimmed screen behind it closes it too.
import type { ReactNode } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { color, size, space } from "../theme";
import { text } from "./controls";

export function Sheet({
  visible,
  onClose,
  title,
  testID,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  testID: string;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.fill}>
        <Pressable
          style={styles.behind}
          onPress={onClose}
          accessible={false}
          importantForAccessibility="no"
        />
        <View
          testID={testID}
          accessibilityViewIsModal
          style={[styles.panel, { paddingBottom: Math.max(insets.bottom, space[4]) }]}
        >
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={text.heading} accessibilityRole="header">
              {title}
            </Text>
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: "flex-end" },
  behind: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(17, 24, 39, 0.4)",
  },
  panel: {
    maxHeight: "85%",
    backgroundColor: color.surface,
    borderTopLeftRadius: size.radiusPrimary,
    borderTopRightRadius: size.radiusPrimary,
    paddingTop: space[4],
    paddingHorizontal: space[4],
  },
  content: { gap: space[3], paddingBottom: space[2] },
});
