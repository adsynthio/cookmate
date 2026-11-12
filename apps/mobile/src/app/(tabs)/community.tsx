// Community, first version: private cooking circles for family and friends (no public feed). A household starts a
// circle or joins one with an invite code; members see the dishes the others cooked, with their changes and a note,
// and can cook or save them. Posts can be reported (hidden for you at once) or removed by their author or the
// circle's owner. Nothing is shared unless the cook taps Share.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Image, Share, StyleSheet, View } from "react-native";

import { AppHeader } from "@/components/AppHeader";
import { Icon } from "@/design-system/icons";
import { dishImage, illustrations } from "@/design-system/media";
import { Enter, Layout, PressableScale } from "@/design-system/motion";
import { Badge, Button, Chip, Field, Screen, SectionHeader, StateView, Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { radius, shadow, space } from "@/design-system/tokens";
import { cleanInviteCode, showInviteCode, timeAgo } from "@/domain/community";
import { getLocale, t, useLocale, type StringKey } from "@/i18n";
import { CommunityError, services, type Circle, type CommunityPost, type ReportReason } from "@/services";
import { useSession } from "@/state/session";

const REASONS: ReportReason[] = ["spam", "unsafe", "offensive", "other"];

export default function CommunityScreen() {
  useLocale();
  const householdId = useSession((s) => s.householdId)!;
  const memberId = useSession((s) => s.memberId);
  const qc = useQueryClient();
  const [circleId, setCircleId] = useState<string | null>(null);
  const [panel, setPanel] = useState<"none" | "create" | "join">("none");

  const members = useQuery({ queryKey: ["members", householdId], queryFn: () => services.preference.listMembers(householdId) });
  const me = (members.data ?? []).find((m) => m.id === memberId);
  const defaultName = me ? t("community.kitchenOf", { name: me.displayName }) : t("community.myKitchen");

  const circles = useQuery({ queryKey: ["circles", householdId], queryFn: () => services.community.listCircles(householdId) });
  const selected = circles.data?.find((c) => c.id === circleId) ?? null;
  const feed = useQuery({
    queryKey: ["feed", householdId, circleId],
    queryFn: () => services.community.feed(householdId, circleId ?? undefined),
    enabled: !!circles.data?.length,
  });
  const refetchFeed = feed.refetch;
  const refetchCircles = circles.refetch;
  useFocusEffect(
    useCallback(() => {
      void refetchCircles();
      void refetchFeed();
    }, [refetchCircles, refetchFeed]),
  );
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["circles", householdId] });
    void qc.invalidateQueries({ queryKey: ["feed", householdId] });
  };

  return (
    <Screen header={<AppHeader title={t("tab.community")} />}>
      {circles.isPending ? (
        <StateView state="loading" title={t("tab.community")} />
      ) : circles.isError ? (
        <StateView state="error" title={t("state.error.title")} body={t("state.error.body")} actionLabel={t("state.retry")} onAction={() => void circles.refetch()} />
      ) : !circles.data.length && panel === "none" ? (
        <Welcome onCreate={() => setPanel("create")} onJoin={() => setPanel("join")} />
      ) : (
        <>
          {circles.data.length ? (
            <View style={styles.chips}>
              <Chip label={t("community.all")} solid selected={circleId === null} onPress={() => setCircleId(null)} />
              {circles.data.map((c) => (
                <Chip key={c.id} icon="users" label={c.name} solid selected={circleId === c.id} onPress={() => setCircleId(c.id)} />
              ))}
              <Chip icon="plus" label={t("community.addCircle")} dashed onPress={() => setPanel(panel === "none" ? "join" : "none")} />
            </View>
          ) : null}

          {panel !== "none" ? (
            <CirclePanel
              mode={panel}
              setMode={setPanel}
              householdId={householdId}
              defaultName={defaultName}
              onDone={(id) => {
                setPanel("none");
                setCircleId(id);
                refresh();
              }}
            />
          ) : null}

          {selected ? <CircleCard circle={selected} householdId={householdId} onLeft={() => (setCircleId(null), refresh())} /> : null}

          {circles.data.length ? (
            <>
              <SectionHeader title={t("community.cooked")} dot={undefined} />
              {feed.isPending ? (
                <StateView state="loading" title={t("community.cooked")} />
              ) : feed.isError ? (
                <StateView state="error" title={t("state.error.title")} body={t("state.error.body")} actionLabel={t("state.retry")} onAction={() => void feed.refetch()} />
              ) : !feed.data.length ? (
                <StateView state="empty" illustration={illustrations.emptyPicks} title={t("community.emptyFeed")} body={t("community.emptyFeedBody")} />
              ) : (
                feed.data.map((p, i) => (
                  <Layout key={p.id}>
                    <PostCard post={p} index={i} householdId={householdId} onChanged={refresh} />
                  </Layout>
                ))
              )}
            </>
          ) : null}
        </>
      )}
    </Screen>
  );
}

function Welcome({ onCreate, onJoin }: { onCreate: () => void; onJoin: () => void }) {
  const { colors } = useTheme();
  return (
    <Enter>
      <View style={[styles.welcome, { backgroundColor: colors.primaryContainer }]}>
        {illustrations.allDone ? <Image source={illustrations.allDone} style={styles.art} resizeMode="contain" accessible={false} /> : null}
        <Text variant="title" color={colors.onPrimary} accessibilityRole="header">
          {t("community.welcome.title")}
        </Text>
        <Text color={colors.onPrimary}>{t("community.welcome.body")}</Text>
        <View style={{ gap: space.sm }}>
          <Button kind="light" stretch icon="plus" label={t("community.create")} onPress={onCreate} />
          <Button kind="light" stretch icon="users" label={t("community.join")} onPress={onJoin} />
        </View>
        <View style={styles.row}>
          <Icon name="shield" size={16} color={colors.onPrimary} />
          <Text variant="caption" color={colors.onPrimary} style={{ flex: 1 }}>
            {t("community.privacy")}
          </Text>
        </View>
      </View>
    </Enter>
  );
}

/** Start a circle or join one with a code; the household picks how it is shown there. */
function CirclePanel({
  mode,
  setMode,
  householdId,
  defaultName,
  onDone,
}: {
  mode: "create" | "join";
  setMode: (m: "create" | "join" | "none") => void;
  householdId: string;
  defaultName: string;
  onDone: (circleId: string) => void;
}) {
  const { colors } = useTheme();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [display, setDisplay] = useState(defaultName);
  const run = useMutation({
    mutationFn: () =>
      mode === "create"
        ? services.community.createCircle({ householdId, name: name.trim(), displayName: display.trim() })
        : services.community.join({ code: cleanInviteCode(code)!, householdId, displayName: display.trim() }),
    onSuccess: onDone,
  });
  const ready = display.trim().length > 0 && (mode === "create" ? name.trim().length > 0 : cleanInviteCode(code) !== null);
  const problem = run.error instanceof CommunityError ? t(`community.problem.${run.error.problem}` as StringKey) : run.isError ? t("state.error.body") : null;
  return (
    <Enter>
      <View style={[styles.card, shadow.card, { backgroundColor: colors.surface }]}>
        <View style={[styles.segment, { backgroundColor: colors.surfaceMuted }]} accessibilityRole="tablist">
          {(["join", "create"] as const).map((m) => (
            <PressableScale
              key={m}
              accessibilityRole="tab"
              accessibilityState={{ selected: mode === m }}
              onPress={() => setMode(m)}
              style={[styles.segmentItem, mode === m && [shadow.card, { backgroundColor: colors.surface }]]}
            >
              <Text variant="label" weight={600} color={mode === m ? colors.ink : colors.inkSecondary}>
                {t(m === "join" ? "community.join" : "community.create")}
              </Text>
            </PressableScale>
          ))}
        </View>
        {mode === "create" ? (
          <>
            <Text variant="label" muted>
              {t("community.circleName")}
            </Text>
            <Field value={name} onChangeText={setName} placeholder={t("community.circleNameHint")} maxLength={60} accessibilityLabel={t("community.circleName")} />
          </>
        ) : (
          <>
            <Text variant="label" muted>
              {t("community.code")}
            </Text>
            <Field
              value={code}
              onChangeText={setCode}
              placeholder="ABCD-EFGH"
              autoCapitalize="characters"
              maxLength={11}
              accessibilityLabel={t("community.code")}
            />
          </>
        )}
        <Text variant="label" muted>
          {t("community.shownAs")}
        </Text>
        <Field value={display} onChangeText={setDisplay} maxLength={40} accessibilityLabel={t("community.shownAs")} />
        {problem ? (
          <Text variant="label" color={colors.alert} accessibilityLiveRegion="polite">
            {problem}
          </Text>
        ) : null}
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Button kind="quiet" stretch label={t("you.cancel")} onPress={() => setMode("none")} />
          </View>
          <View style={{ flex: 1.4 }}>
            <Button
              kind="accent"
              stretch
              label={run.isPending ? t("finish.saving") : t(mode === "create" ? "community.createGo" : "community.joinGo")}
              disabled={!ready || run.isPending}
              onPress={() => run.mutate()}
            />
          </View>
        </View>
      </View>
    </Enter>
  );
}

/** The selected circle: who is in it, an invite code to share, and leaving. */
function CircleCard({ circle, householdId, onLeft }: { circle: Circle; householdId: string; onLeft: () => void }) {
  const { colors } = useTheme();
  const [code, setCode] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const invite = useMutation({ mutationFn: () => services.community.createInvite(circle.id, householdId), onSuccess: setCode });
  const leave = useMutation({ mutationFn: () => services.community.leave(circle.id, householdId), onSuccess: onLeft });
  const share = (c: string) =>
    void Share.share({ message: t("community.inviteMessage", { circle: circle.name, code: showInviteCode(c) }) }).catch(() => {});
  return (
    <Enter>
      <View style={[styles.card, shadow.card, { backgroundColor: colors.surface }]}>
        <View style={styles.row}>
          <Text variant="heading" style={{ flex: 1 }}>
            {circle.name}
          </Text>
          {circle.role === "owner" ? <Badge tone="primary" label={t("community.owner")} /> : null}
        </View>
        <View style={styles.chips}>
          {circle.members.map((m, i) => (
            <View key={`${m.displayName}-${i}`} style={[styles.person, { backgroundColor: m.mine ? colors.primaryPale : colors.surfaceMuted }]}>
              <View style={[styles.mini, { backgroundColor: m.mine ? colors.primary : colors.peach }]}>
                <Text variant="caption" weight={600} color={m.mine ? colors.onPrimary : colors.peachText}>
                  {m.displayName.trim().slice(0, 1).toUpperCase()}
                </Text>
              </View>
              <Text variant="label">{m.displayName}</Text>
            </View>
          ))}
        </View>
        {code ? (
          <View style={[styles.code, { backgroundColor: colors.peach }]}>
            <Text variant="overline" color={colors.peachText}>
              {t("community.inviteCode").toUpperCase()}
            </Text>
            <Text variant="title" color={colors.peachText} style={styles.codeText} selectable>
              {showInviteCode(code)}
            </Text>
            <Text variant="caption" color={colors.peachText}>
              {t("community.inviteHint")}
            </Text>
            <Button kind="accent" icon="share" label={t("community.shareCode")} onPress={() => share(code)} />
          </View>
        ) : (
          <Button kind="secondary" icon="plus" label={invite.isPending ? t("finish.saving") : t("community.invite")} disabled={invite.isPending} onPress={() => invite.mutate()} />
        )}
        <View style={{ alignSelf: "flex-start" }}>
          <Button
            kind="quiet"
            size="small"
            label={confirmLeave ? t("community.leaveSure") : t("community.leave")}
            textColor={confirmLeave ? colors.alert : undefined}
            disabled={leave.isPending}
            onPress={() => (confirmLeave ? leave.mutate() : setConfirmLeave(true))}
          />
        </View>
      </View>
    </Enter>
  );
}

function PostCard({ post, index, householdId, onChanged }: { post: CommunityPost; index: number; householdId: string; onChanged: () => void }) {
  const { colors } = useTheme();
  const router = useRouter();
  const memberId = useSession((s) => s.memberId);
  const [menu, setMenu] = useState<"none" | "report">("none");
  const [saved, setSaved] = useState(false);
  const photo = post.recipeSlug ? dishImage(post.recipeSlug) : null;
  const recipeId = post.recipeId ?? post.recipeSlug;
  const save = useMutation({
    mutationFn: () => services.recipe.setFavourite({ householdId, memberId: memberId!, recipeId: recipeId!, on: true }),
    onSuccess: () => setSaved(true),
  });
  const remove = useMutation({ mutationFn: () => services.community.removePost(post.id, householdId), onSuccess: onChanged });
  const report = useMutation({ mutationFn: (r: ReportReason) => services.community.report(post.id, householdId, r), onSuccess: onChanged });
  return (
    <Enter index={index}>
      <View style={[styles.post, shadow.card, { backgroundColor: colors.surface }]}>
        <View style={[styles.row, { padding: space.lg, paddingBottom: space.md }]}>
          <View style={[styles.avatar, { backgroundColor: post.mine ? colors.primary : colors.peach }]}>
            <Text variant="bodyStrong" color={post.mine ? colors.onPrimary : colors.peachText}>
              {post.authorName.trim().slice(0, 1).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodyStrong" numberOfLines={1}>
              {post.authorName}
            </Text>
            <Text variant="caption" muted numberOfLines={1}>
              {`${post.circleName} · ${timeAgo(post.createdAt, Date.now(), getLocale())}`}
            </Text>
          </View>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={t("community.more")}
            onPress={() => setMenu(menu === "none" ? "report" : "none")}
            hitSlop={8}
            style={styles.more}
          >
            <Icon name="more" size={20} color={colors.inkSecondary} />
          </PressableScale>
        </View>
        {photo ? <Image source={photo} style={styles.photo} resizeMode="cover" accessibilityLabel={post.dishTitle} /> : null}
        <View style={{ padding: space.lg, gap: space.sm }}>
          <Text variant="heading">{post.dishTitle}</Text>
          {post.note ? <Text color={colors.inkSecondary}>{`“${post.note}”`}</Text> : null}
          {post.changes.length ? (
            <View style={styles.chips}>
              {post.changes.map((c) => (
                <View key={c} style={[styles.change, { backgroundColor: colors.primaryPale }]}>
                  <Icon name="edit" size={12} color={colors.primaryText} />
                  <Text variant="caption" weight={600} color={colors.primaryText}>
                    {c}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
          {menu === "report" ? (
            <View style={[styles.menu, { backgroundColor: colors.surfaceMuted }]}>
              {post.canRemove ? (
                <Button kind="quiet" size="small" icon="trash" textColor={colors.alert} label={t("community.remove")} disabled={remove.isPending} onPress={() => remove.mutate()} />
              ) : null}
              {!post.mine ? (
                <>
                  <Text variant="label" muted>
                    {t("community.reportWhy")}
                  </Text>
                  <View style={styles.chips}>
                    {REASONS.map((r) => (
                      <Chip key={r} label={t(`community.reason.${r}` as StringKey)} onPress={() => !report.isPending && report.mutate(r)} />
                    ))}
                  </View>
                </>
              ) : null}
            </View>
          ) : null}
          {recipeId ? (
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Button kind="secondary" stretch size="small" icon={saved ? "check" : "heart"} label={saved ? t("community.saved") : t("community.save")} disabled={saved || save.isPending || !memberId} onPress={() => save.mutate()} />
              </View>
              <View style={{ flex: 1 }}>
                <Button kind="accent" stretch size="small" iconAfter="arrowRight" label={t("community.cookIt")} onPress={() => router.push(`/recipe/${recipeId}`)} />
              </View>
            </View>
          ) : null}
        </View>
      </View>
    </Enter>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  row: { flexDirection: "row", alignItems: "center", gap: space.md },
  welcome: { borderRadius: radius.cardLg, padding: space.xl, gap: space.lg },
  art: { width: 120, height: 120, alignSelf: "center" },
  card: { borderRadius: radius.cardLg, padding: space.lg, gap: space.md },
  segment: { flexDirection: "row", borderRadius: radius.pill, padding: 4, gap: 4 },
  segmentItem: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 44, borderRadius: radius.pill },
  person: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: radius.pill, paddingVertical: 4, paddingLeft: 4, paddingRight: space.md },
  mini: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  code: { borderRadius: radius.card, padding: space.lg, gap: space.sm, alignItems: "flex-start" },
  codeText: { letterSpacing: 2, fontVariant: ["tabular-nums"] },
  post: { borderRadius: radius.cardLg, overflow: "hidden" },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  more: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  photo: { width: "100%", height: 220 },
  change: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 4 },
  menu: { borderRadius: radius.item, padding: space.md, gap: space.sm },
});
