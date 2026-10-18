import { StyleSheet, Text, View } from "react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { ExternalLink } from "@getpaseo/plugin/client/ui";
import { Icon, useToast } from "@getpaseo/plugin/client/react-native";
import type { Check } from "../shared/github";
import { strings } from "./strings";

export function ChecksList({
  checks,
  t,
  theme,
}: {
  checks: readonly Check[];
  t: ReturnType<typeof strings>;
  theme: PluginSurfaceProps["theme"];
}) {
  const toast = useToast();
  const sorted = [...checks].sort(
    (a, b) => Number(b.status === "failure") - Number(a.status === "failure"),
  );
  return (
    <View style={styles.list}>
      {sorted.map((check, index) => {
        const name = check.workflow
          ? `${check.workflow} / ${check.name}`
          : check.name;
        const label = `${name} · ${t.checkStates[check.status]}`;
        const row = (
          <View style={styles.row}>
            <Icon
              name={checkIcon(check.status)}
              size={13}
              color={checkColor(check.status, theme)}
            />
            <Text
              numberOfLines={1}
              style={[
                styles.name,
                {
                  color: check.url
                    ? theme.colors.foreground
                    : theme.colors.foregroundMuted,
                },
              ]}
            >
              {name}
            </Text>
            {check.duration && (
              <Text
                style={[styles.meta, { color: theme.colors.foregroundMuted }]}
              >
                {check.duration}
              </Text>
            )}
          </View>
        );
        return check.url ? (
          <ExternalLink
            key={index}
            href={check.url}
            accessibilityLabel={label}
            onError={() => toast.error(t.openCheckError)}
          >
            {row}
          </ExternalLink>
        ) : (
          <View key={index} accessible accessibilityLabel={label}>
            {row}
          </View>
        );
      })}
    </View>
  );
}
function checkIcon(status: Check["status"]) {
  return status === "success"
    ? "CircleCheck"
    : status === "failure"
      ? "CircleX"
      : status === "pending"
        ? "CircleDot"
        : status === "skipped"
          ? "CircleSlash"
          : "Ban";
}
function checkColor(
  status: Check["status"],
  theme: PluginSurfaceProps["theme"],
) {
  return status === "success"
    ? theme.colors.statusSuccess
    : status === "failure"
      ? theme.colors.statusDanger
      : status === "pending"
        ? theme.colors.statusWarning
        : theme.colors.foregroundMuted;
}
const styles = StyleSheet.create({
  list: { gap: 2, paddingVertical: 2 },
  row: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
  },
  name: { flex: 1, minWidth: 0, fontSize: 12, lineHeight: 16 },
  meta: { fontSize: 12, lineHeight: 16 },
});
