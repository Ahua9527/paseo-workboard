import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { useRpc } from "@getpaseo/plugin/client";
import { ExternalLink } from "@getpaseo/plugin/client/ui";
import {
  Icon,
  ScrollView,
  useToast,
} from "@getpaseo/plugin/client/react-native";
import type { GithubInbox, GithubItem } from "../shared/github";
import type { Board, Card } from "../shared/model";
import { githubRpc } from "../shared/rpc";
import { shortDate } from "./board-utils";
import { stageTitle, strings } from "./strings";
import { HintButton } from "./Hint";
import { ChecksList } from "./ChecksList";
import { checksColor, checksIcon, reviewColor, reviewIcon } from "./TaskItem";
import { PageHeader } from "./WorkboardScreen";

export function useGithubInbox(hostId: string) {
  const call = useRpc(githubRpc);
  const cache = useQueryClient();
  const queryKey = ["workboard-github", hostId];
  const query = useQuery({
    queryKey,
    queryFn: () => call({ refresh: false }),
    refetchInterval: 120_000,
  });
  const refresh = async () => {
    const next = await call({ refresh: true });
    cache.setQueryData<GithubInbox>(queryKey, next);
  };
  return { query, refresh };
}

/** The board card already tracking this item, by PR link or by its URL in a live card's text. */
export function linkedCard(
  item: GithubItem,
  cards: readonly Card[],
): Card | undefined {
  const mentions = (text: string) => {
    for (
      let index = text.indexOf(item.url);
      index !== -1;
      index = text.indexOf(item.url, index + 1)
    )
      if (!/\d/.test(text.charAt(index + item.url.length))) return true;
    return false;
  };
  return cards.find(
    (card) =>
      (card.workspaceId !== null && card.changeRequest?.url === item.url) ||
      ((card.archived === null ||
        (card.archived.status !== "archived" &&
          card.archived.status !== "external")) &&
        (mentions(card.title) || mentions(card.description))),
  );
}

export function failingPrCount(inbox: GithubInbox | undefined): number {
  return (
    inbox?.items.filter(
      (item) => item.kind === "pr" && item.checksStatus === "failure",
    ).length ?? 0
  );
}

export function GitHubPage({
  board,
  t,
  theme,
  layout,
  disabled,
  inbox,
  pendingMutationIds,
  refresh,
  onBack,
  onConvert,
}: {
  board: Board;
  t: ReturnType<typeof strings>;
  theme: PluginSurfaceProps["theme"];
  layout: PluginSurfaceProps["layout"];
  disabled: boolean;
  inbox: UseQueryResult<GithubInbox>;
  pendingMutationIds: ReadonlySet<string>;
  refresh(): Promise<void>;
  onBack(): void;
  onConvert(item: GithubItem): void;
}) {
  const toast = useToast();
  const [refreshing, setRefreshing] = useState(false);
  const data = inbox.data;
  const byUpdated = (a: GithubItem, b: GithubItem) =>
    b.updatedAt.localeCompare(a.updatedAt);
  const prs = (data?.items ?? [])
    .filter((item) => item.kind === "pr")
    .sort(
      (a, b) =>
        Number(b.checksStatus === "failure") -
          Number(a.checksStatus === "failure") || byUpdated(a, b),
    );
  const issues = (data?.items ?? [])
    .filter((item) => item.kind === "issue")
    .sort(byUpdated);
  const notice =
    data?.status === "gh-missing"
      ? t.githubGhMissing
      : data?.status === "unauthenticated"
        ? t.githubUnauthenticated
        : data?.status === "error"
          ? t.githubError.replace("{error}", data.error ?? t.githubLoadError)
          : null;
  const busy = refreshing || inbox.isFetching;
  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.surface0 }]}>
      <PageHeader title={t.github} t={t} theme={theme} onBack={onBack}>
        <View style={styles.headerActions}>
          {data?.fetchedAt && (
            <Text
              style={[styles.meta, { color: theme.colors.foregroundMuted }]}
            >
              {t.githubUpdatedAt.replace(
                "{time}",
                new Date(data.fetchedAt).toLocaleTimeString(t.locale, {
                  hour: "2-digit",
                  minute: "2-digit",
                }),
              )}
            </Text>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={busy ? t.githubRefreshing : t.refresh}
            disabled={busy}
            onPress={async () => {
              setRefreshing(true);
              try {
                await refresh();
              } catch {
                toast.error(t.githubRefreshError);
              } finally {
                setRefreshing(false);
              }
            }}
            style={({ pressed }) => [
              styles.button,
              busy && styles.disabled,
              pressed && { backgroundColor: theme.colors.surface2 },
            ]}
          >
            <Icon
              name={busy ? "LoaderCircle" : "RefreshCw"}
              size={16}
              color={theme.colors.foregroundMuted}
            />
            {!layout.compact && (
              <Text
                style={[
                  styles.controlText,
                  { color: theme.colors.foregroundMuted },
                ]}
              >
                {busy ? t.githubRefreshing : t.refresh}
              </Text>
            )}
          </Pressable>
        </View>
      </PageHeader>
      <ScrollView contentContainerStyle={styles.content}>
        {!data ? (
          <Text style={{ color: theme.colors.foregroundMuted }}>
            {inbox.isError ? t.githubLoadError : t.githubLoading}
          </Text>
        ) : (
          <>
            {notice && (
              <Text
                accessibilityLiveRegion="polite"
                style={[styles.hint, { color: theme.colors.statusWarning }]}
              >
                {notice}
              </Text>
            )}
            {data.truncated && (
              <Text
                style={[styles.hint, { color: theme.colors.foregroundMuted }]}
              >
                {t.githubTruncated}
              </Text>
            )}
            {data.status === "ok" && !data.items.length && (
              <Text style={{ color: theme.colors.foregroundMuted }}>
                {t.githubEmpty}
              </Text>
            )}
            {(
              [
                [t.githubPrs, prs],
                [t.githubIssues, issues],
              ] as const
            ).map(
              ([title, items]) =>
                items.length > 0 && (
                  <View key={title} style={styles.section}>
                    <Text
                      accessibilityRole="header"
                      style={[
                        styles.sectionTitle,
                        { color: theme.colors.foreground },
                      ]}
                    >
                      {title.replace("{count}", String(items.length))}
                    </Text>
                    <View
                      style={[
                        styles.list,
                        {
                          backgroundColor: theme.colors.surface1,
                          borderColor: theme.colors.border,
                        },
                      ]}
                    >
                      {items.map((item) => (
                        <GitHubRow
                          key={item.url}
                          item={item}
                          board={board}
                          t={t}
                          theme={theme}
                          compact={layout.compact}
                          converting={pendingMutationIds.has(
                            `github:${item.url}`,
                          )}
                          disabled={disabled}
                          onConvert={() => onConvert(item)}
                        />
                      ))}
                    </View>
                  </View>
                ),
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function GitHubRow({
  item,
  board,
  t,
  theme,
  compact,
  converting,
  disabled,
  onConvert,
}: {
  item: GithubItem;
  board: Board;
  t: ReturnType<typeof strings>;
  theme: PluginSurfaceProps["theme"];
  compact: boolean;
  converting: boolean;
  disabled: boolean;
  onConvert(): void;
}) {
  const toast = useToast();
  const [checksOpen, setChecksOpen] = useState(false);
  const linked = linkedCard(item, board.cards);
  const pr = item.kind === "pr";
  const checksExpandable = item.checks.length > 0;
  const checksLabel =
    item.checksStatus === "none"
      ? ""
      : checksExpandable
        ? `${t.checks[item.checksStatus]} · ${checksOpen ? t.hideChecks : t.showChecks}`
        : t.checks[item.checksStatus];
  const reference = `${item.repo} #${item.number}`;
  return (
    <View style={[styles.row, { borderColor: theme.colors.border }]}>
      <View style={[styles.rowMain, compact && styles.rowMainCompact]}>
        <View style={styles.rowBody}>
          <View style={styles.inline}>
            <Icon
              name={
                !pr
                  ? "CircleDot"
                  : item.isDraft
                    ? "GitPullRequestDraft"
                    : "GitPullRequest"
              }
              size={14}
              color={
                pr && item.isDraft
                  ? theme.colors.foregroundMuted
                  : theme.colors.statusSuccess
              }
            />
            <Text
              numberOfLines={1}
              style={[
                styles.meta,
                styles.shrink,
                { color: theme.colors.foregroundMuted },
              ]}
            >
              {pr && item.isDraft
                ? `${reference} · ${t.githubDraftPr}`
                : reference}
            </Text>
          </View>
          <ExternalLink
            href={item.url}
            accessibilityLabel={`${reference}: ${item.title}`}
            onError={() => toast.error(t.githubOpenError)}
          >
            <Text
              numberOfLines={2}
              style={[styles.title, { color: theme.colors.foreground }]}
            >
              {item.title}
            </Text>
          </ExternalLink>
          <View style={styles.inline}>
            {item.labels.slice(0, 3).map((label) => (
              <View
                key={label}
                style={[styles.label, { borderColor: theme.colors.border }]}
              >
                <Text
                  numberOfLines={1}
                  style={[styles.meta, { color: theme.colors.foregroundMuted }]}
                >
                  {label}
                </Text>
              </View>
            ))}
            <Text
              style={[styles.meta, { color: theme.colors.foregroundMuted }]}
            >
              {shortDate(item.updatedAt, t.locale)}
            </Text>
            {pr && item.checksStatus !== "none" && (
              <HintButton
                hint={checksLabel}
                accessibilityRole="button"
                accessibilityLabel={checksLabel}
                accessibilityState={
                  checksExpandable ? { expanded: checksOpen } : undefined
                }
                aria-expanded={checksExpandable ? checksOpen : undefined}
                onPress={
                  checksExpandable
                    ? () => setChecksOpen((value) => !value)
                    : undefined
                }
                style={styles.statusAction}
              >
                <Icon
                  name={checksIcon(item.checksStatus)}
                  size={14}
                  color={checksColor(item.checksStatus, theme)}
                />
              </HintButton>
            )}
            {pr && item.reviewDecision && (
              <HintButton
                hint={t.reviews[item.reviewDecision]}
                accessibilityRole="button"
                accessibilityLabel={t.reviews[item.reviewDecision]}
                style={styles.statusAction}
              >
                <Icon
                  name={reviewIcon(item.reviewDecision)}
                  size={14}
                  color={reviewColor(item.reviewDecision, theme)}
                />
              </HintButton>
            )}
          </View>
        </View>
        {linked ? (
          <Text
            numberOfLines={1}
            style={[
              styles.meta,
              styles.linked,
              { color: theme.colors.foregroundMuted },
            ]}
          >
            {t.onBoard.replace(
              "{group}",
              stageTitle(linked.stage, board.settings.groups, t),
            )}
          </Text>
        ) : (
          <HintButton
            hint={t.convertToTaskHint}
            accessibilityRole="button"
            accessibilityLabel={`${t.convertToTask}: ${item.title}`}
            disabled={disabled || converting}
            onPress={onConvert}
            style={({ pressed }) => [
              styles.button,
              styles.convert,
              compact && styles.convertCompact,
              { borderColor: theme.colors.border },
              (disabled || converting) && styles.disabled,
              pressed && { backgroundColor: theme.colors.surface2 },
            ]}
          >
            <Icon
              name={converting ? "LoaderCircle" : "Plus"}
              size={14}
              color={theme.colors.foreground}
            />
            <Text
              style={[styles.controlText, { color: theme.colors.foreground }]}
            >
              {t.convertToTask}
            </Text>
          </HintButton>
        )}
      </View>
      {checksOpen && checksExpandable && (
        <ChecksList checks={item.checks} t={t} theme={theme} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, minHeight: 0 },
  headerActions: {
    marginLeft: "auto",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  content: { padding: 12, gap: 16 },
  section: { gap: 6 },
  sectionTitle: { fontSize: 14, lineHeight: 20, fontWeight: "600" },
  list: { borderWidth: 1, borderRadius: 8, overflow: "hidden" },
  row: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 4,
  },
  rowMain: { flexDirection: "row", alignItems: "center", gap: 12 },
  rowMainCompact: { flexDirection: "column", alignItems: "stretch", gap: 6 },
  rowBody: { flex: 1, minWidth: 0, gap: 2 },
  inline: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: 6,
    minWidth: 0,
  },
  shrink: { flexShrink: 1, minWidth: 0 },
  title: { fontWeight: "600", fontSize: 14, lineHeight: 18 },
  meta: { fontSize: 12, lineHeight: 16 },
  label: {
    maxWidth: 160,
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 6,
  },
  linked: { flexShrink: 0, maxWidth: 220 },
  statusAction: {
    width: 36,
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  button: {
    minHeight: 36,
    minWidth: 36,
    paddingHorizontal: 10,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  convert: { borderWidth: 1, flexShrink: 0 },
  convertCompact: { alignSelf: "flex-start" },
  disabled: { opacity: 0.5 },
  controlText: { fontSize: 14, lineHeight: 20 },
  hint: { fontSize: 13, lineHeight: 18 },
});
