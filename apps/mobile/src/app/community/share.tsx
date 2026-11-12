// Share a dish with a circle: pick the circle, say a line about it, keep or drop the changes you made. Opened from
// "All done" after cooking (with the changes picked there) and from a recipe. Nothing else goes with it.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Image, StyleSheet, View } from "react-native";

import { AppHeader } from "@/components/AppHeader";
import { Icon } from "@/design-system/icons";
import { dishImage } from "@/design-system/media";
import { Enter } from "@/design-system/motion";
import { Button, Chip, Field, Screen, StateView, Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { radius, shadow, space } from "@/design-system/tokens";
import { shareable } from "@/domain/community";
import { t, useLocale, type StringKey } from "@/i18n";
import { CommunityError, services } from "@/services";
import { useSession } from "@/state/session";

export default function ShareScreen() {
  useLocale();
  const router = useRouter();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const householdId = useSession((s) => s.householdId)!;
  const params = useLocalSearchParams<{ recipeId?: string; slug?: string; title?: string; changes?: string }>();
  const title = params.title ?? "";
  const [changes, setChanges] = useState<string[]>(() => (params.changes ? params.changes.split("|").filter(Boolean) : []));
  const [kept, setKept] = useState<string[]>(changes);
  const [extra, setExtra] = useState("");
  const [note, setNote] = useState("");
  const circles = useQuery({ queryKey: ["circles", householdId], queryFn: () => services.community.listCircles(householdId) });
  const [circleId, setCircleId] = useState<string | null>(null);
  const target = circleId ?? circles.data?.[0]?.id ?? null;

  const share = useMutation({
    mutationFn: () => {
      const s = shareable(note, kept);
      return services.community.share({
        circleId: target!,
        householdId,
        // Bundled recipes are known by slug; the server only links ids it can see.
        recipeId: params.recipeId && /^[0-9a-f-]{36}$/.test(params.recipeId) ? params.recipeId : null,
        recipeSlug: params.slug ?? null,
        dishTitle: title,
        note: s.note,
        changes: s.changes,
      });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["feed", householdId] }),
  });
  const addExtra = () => {
    const c = extra.trim();
    if (!c) return;
    setChanges((l) => (l.includes(c) ? l : [...l, c]));
    setKept((l) => (l.includes(c) ? l : [...l, c]));
    setExtra("");
  };
  const photo = params.slug ? dishImage(params.slug) : null;
  const circleName = circles.data?.find((c) => c.id === target)?.name ?? "";

  return (
    <Screen header={<AppHeader title={t("community.shareTitle")} back mic={false} />} tabBar={false}>
      {circles.isPending ? (
        <StateView state="loading" title={t("community.shareTitle")} />
      ) : circles.isError ? (
        <StateView state="error" title={t("state.error.title")} body={t("state.error.body")} actionLabel={t("state.retry")} onAction={() => void circles.refetch()} />
      ) : !circles.data.length ? (
        <StateView
          state="empty"
          title={t("community.noCircle")}
          body={t("community.noCircleBody")}
          actionLabel={t("community.goCommunity")}
          onAction={() => router.replace("/community")}
        />
      ) : share.isSuccess ? (
        <Enter style={{ gap: space.lg }}>
          <View style={[styles.done, { backgroundColor: colors.primaryContainer }]}>
            <Icon name="checkCircle" size={36} color={colors.onPrimary} />
            <Text variant="title" color={colors.onPrimary}>
              {t("community.sharedTitle", { circle: circleName })}
            </Text>
            <Text color={colors.onPrimary}>{t("community.sharedBody")}</Text>
          </View>
          <Button kind="accent" size="cook" stretch iconAfter="arrowRight" label={t("community.goCommunity")} onPress={() => router.replace("/community")} />
          <Button kind="quiet" label={t("timers.back")} onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
        </Enter>
      ) : (
        <>
          <Enter>
            <View style={[styles.dish, shadow.card, { backgroundColor: colors.surface }]}>
              {photo ? <Image source={photo} style={styles.photo} resizeMode="cover" accessible={false} /> : null}
              <View style={{ padding: space.lg, gap: 2 }}>
                <Text variant="overline" color={colors.accentText}>
                  {t("community.youCooked").toUpperCase()}
                </Text>
                <Text variant="title">{title}</Text>
              </View>
            </View>
          </Enter>

          <Text variant="subheading">{t("community.withWhom")}</Text>
          <View style={styles.chips} accessibilityRole="radiogroup">
            {circles.data.map((c) => (
              <Chip key={c.id} icon="users" solid label={c.name} selected={c.id === target} onPress={() => setCircleId(c.id)} />
            ))}
          </View>

          <Text variant="subheading">{t("community.saySomething")}</Text>
          <Field value={note} onChangeText={setNote} placeholder={t("community.notePlaceholder")} multiline maxLength={500} accessibilityLabel={t("community.saySomething")} />

          <Text variant="subheading">{t("community.yourChanges")}</Text>
          <Text variant="caption" muted>
            {t("community.yourChangesBody")}
          </Text>
          {changes.length ? (
            <View style={styles.chips}>
              {changes.map((c) => (
                <Chip key={c} label={c} selected={kept.includes(c)} showCheck onPress={() => setKept((l) => (l.includes(c) ? l.filter((x) => x !== c) : [...l, c]))} />
              ))}
            </View>
          ) : null}
          <View style={styles.row}>
            <Field
              value={extra}
              onChangeText={setExtra}
              placeholder={t("community.changePlaceholder")}
              maxLength={80}
              onSubmitEditing={addExtra}
              accessibilityLabel={t("community.changePlaceholder")}
              style={{ flex: 1, minWidth: 0 }}
            />
            <Button kind="secondary" icon="plus" label={t("community.addChange")} disabled={!extra.trim()} onPress={addExtra} />
          </View>

          <View style={[styles.privacy, { backgroundColor: colors.surfaceMuted }]}>
            <Icon name="shield" size={16} color={colors.inkSecondary} />
            <Text variant="caption" muted style={{ flex: 1 }}>
              {t("community.shareWhat")}
            </Text>
          </View>
          {share.isError ? (
            <Text variant="label" color={colors.alert} accessibilityLiveRegion="polite">
              {share.error instanceof CommunityError ? t(`community.problem.${share.error.problem}` as StringKey) : t("state.error.body")}
            </Text>
          ) : null}
          <Button
            kind="accent"
            size="cook"
            stretch
            icon="share"
            label={share.isPending ? t("finish.saving") : t("community.shareGo", { circle: circleName })}
            disabled={!target || !title || share.isPending}
            onPress={() => share.mutate()}
          />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  dish: { borderRadius: radius.cardLg, overflow: "hidden" },
  photo: { width: "100%", height: 180 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm },
  privacy: { flexDirection: "row", alignItems: "flex-start", gap: space.sm, borderRadius: radius.item, padding: space.md },
  done: { borderRadius: radius.cardLg, padding: space.xl, gap: space.md },
});
