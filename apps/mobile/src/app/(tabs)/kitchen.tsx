// Kitchen (KIT-030/033/034), from the Stitch "Pantry & Larder" screen: how many things are in, three ways to add,
// the terracotta "Use soon" card, place filters, "Needs care" (going off, or not sure it's still there) above
// "Fresh and stocked", staples as Full / Low / Out, and a dish this kitchen can make right now. Live across phones.
import { RestockCard } from "@/components/kitchen/RestockCard";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { AppHeader } from "@/components/AppHeader";
import { itemName } from "@/components/kitchen/names";
import { UndoBar } from "@/components/UndoBar";
import { catalogEntry } from "@/data/catalog";
import { recipeDocs } from "@/data/recipes";
import { Icon, type IconName } from "@/design-system/icons";
import { dishImage, illustrations, ingredientImage } from "@/design-system/media";
import { Enter, Layout, PressableScale, Pulse } from "@/design-system/motion";
import { Badge, Button, Card, Chip, IconButton, Photo, Screen, SectionHeader, StateView, Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { radius, shadow, space } from "@/design-system/tokens";
import { expiryInfo, formatQuantity, LOW_CONFIDENCE, type ExpiryInfo } from "@/domain/kitchen";
import { dishesWithin } from "@/domain/kitchenSetup";
import type { Diet } from "@/domain/onboarding";
import { totalTime } from "@/domain/recipes";
import { getLocale, t, useLocale, type StringKey } from "@/i18n";
import { services, type LocationKind, type PantryItem, type StapleLevel } from "@/services";
import { useSession } from "@/state/session";

type Filter = "all" | Exclude<LocationKind, "counter">;
const FILTERS: Filter[] = ["all", "fridge", "pantry", "freezer", "staples", "ready_made"];
const FILTER_ICON: Record<Filter, IconName | undefined> = {
  all: undefined,
  fridge: "fridge",
  pantry: "pantry",
  freezer: "freezer",
  staples: "box",
  ready_made: "cart",
};
const LEVELS: StapleLevel[] = ["full", "low", "out"];

const placeOf = (i: PantryItem): Filter => (i.location === "counter" ? "pantry" : i.location);
const needsCare = (i: PantryItem, e: ExpiryInfo | null) => !!i.guess || i.confidence < LOW_CONFIDENCE || (!!e && e.kind !== "later");

export default function KitchenScreen() {
  useLocale();
  const router = useRouter();
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const householdId = useSession((s) => s.householdId);
  const memberId = useSession((s) => s.memberId);
  const [filter, setFilter] = useState<Filter>("all");
  const [hideSoon, setHideSoon] = useState(false);

  const kitchen = useQuery({
    queryKey: ["kitchen", householdId],
    queryFn: () => services.kitchen.getKitchen(householdId!),
    enabled: !!householdId,
  });
  const members = useQuery({
    queryKey: ["members", householdId],
    queryFn: () => services.preference.listMembers(householdId!),
    enabled: !!householdId,
  });
  const clearGuesses = useMutation({
    mutationFn: () => services.kitchen.clearGuesses(householdId!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["kitchen", householdId] }),
  });

  // KIT-030: changes from other phones in the household arrive over Realtime.
  useEffect(() => {
    if (!householdId) return;
    return services.kitchen.subscribe(householdId, () => {
      void queryClient.invalidateQueries({ queryKey: ["kitchen", householdId] });
      void queryClient.invalidateQueries({ queryKey: ["useSoon", householdId] });
    });
  }, [householdId, queryClient]);

  const all = kitchen.data ?? [];
  const counts = useMemo(() => {
    const c = new Map<Filter, number>([["all", all.length]]);
    for (const i of all) c.set(placeOf(i), (c.get(placeOf(i)) ?? 0) + 1);
    return c;
  }, [all]);

  const shown = all.filter((i) => filter === "all" || placeOf(i) === filter);
  const staples = shown.filter((i) => i.stapleLevel !== null);
  const loose = shown
    .filter((i) => i.stapleLevel === null)
    .map((i) => ({ item: i, expiry: expiryInfo(i.expiryDate, i.expiryEstimated) }));
  const care = loose.filter((x) => needsCare(x.item, x.expiry)).sort((a, b) => (a.expiry?.days ?? 99) - (b.expiry?.days ?? 99));
  const fresh = loose.filter((x) => !needsCare(x.item, x.expiry)).sort((a, b) => (a.expiry?.days ?? 999) - (b.expiry?.days ?? 999));
  const goingOff = all.filter((i) => {
    const e = expiryInfo(i.expiryDate, i.expiryEstimated);
    return i.stapleLevel === null && !!e && e.kind !== "later";
  });

  const self = members.data?.find((m) => m.id === memberId) ?? members.data?.[0];
  const diet: Diet = (self?.diet as Diet | undefined) ?? "veg";
  const suggestion = useMemo(() => {
    const have = all.filter((i) => i.stapleLevel !== "out").map((i) => ({ name: i.ingredientKey ?? i.name, place: "pantry" as const, known: !!i.ingredientKey }));
    const best = dishesWithin(have, recipeDocs, (n) => !!catalogEntry(n)?.staple, diet, undefined, 0.5)[0];
    if (!best) return null;
    const doc = recipeDocs.find((r) => r.slug === best.slug)!;
    const names = new Set(have.map((h) => h.name));
    const uses = doc.ingredients.filter((i) => names.has(i.ingredient) && !catalogEntry(i.ingredient)?.staple).map((i) => i.ingredient);
    return { doc, share: best.share, uses };
  }, [all, diet]);

  const cookWith = (item: PantryItem) => router.navigate({ pathname: "/", params: { use: item.id } });

  return (
    <View style={{ flex: 1 }}>
      <Screen
        header={
          <AppHeader
            title={t("kitchen.title")}
            right={
              <IconButton label={t("tab.list")} tone="plain" onPress={() => router.navigate("/list")}>
                <Icon name="cart" />
              </IconButton>
            }
          />
        }
      >
        <Enter>
          <View style={styles.titleRow}>
            <Text variant="heading" accessibilityRole="header" style={{ flex: 1 }}>
              {t("kitchen.heading")}
            </Text>
            <View style={[styles.count, { backgroundColor: colors.surfaceHigh }]}>
              <Pulse color={colors.primary} />
              <Text variant="caption" weight={600} muted>
                {t("kitchen.count", { n: all.length })}
              </Text>
            </View>
          </View>
          <Text muted>{t("kitchen.sub")}</Text>
        </Enter>

        <View style={styles.actions}>
          <QuickAction index={0} icon="plus" tone="primary" label={t("kitchen.action.add")} onPress={() => router.push("/pantry/add")} />
          <QuickAction index={1} icon="camera" tone="accent" label={t("kitchen.action.scan")} onPress={() => router.push("/pantry/scan")} />
          <QuickAction index={2} icon="mic" tone="peach" label={t("kitchen.action.voice")} onPress={() => router.push("/voice")} />
        </View>

        {householdId ? <RestockCard householdId={householdId} /> : null}

        {goingOff.length && !hideSoon ? (
          <Enter index={3}>
            <Card tone="accent">
              <View style={styles.soonHead}>
                <Badge label={t("kitchen.useSoon.badge").toUpperCase()} tone="onColor" />
                <View style={[styles.dot, { backgroundColor: colors.accentSoft }]} />
                <Text variant="caption" color={colors.onAccent} style={{ opacity: 0.85, flex: 1 }}>
                  {t("kitchen.useSoon.flag")}
                </Text>
                <Icon name="hourglass" size={20} color={colors.onAccent} />
              </View>
              <Text variant="heading" color={colors.onAccent}>
                {goingOff.length === 1 ? t("kitchen.useSoon.titleOne") : t("kitchen.useSoon.title", { n: goingOff.length })}
              </Text>
              <Text variant="caption" color={colors.onAccent} style={{ opacity: 0.85 }}>
                {goingOff.slice(0, 4).map(itemName).join(", ")}
              </Text>
              <View style={styles.soonActions}>
                <View style={{ flex: 1 }}>
                  <Button kind="light" icon="sparkle" stretch label={t("kitchen.useSoon.cta")} onPress={() => cookWith(goingOff[0]!)} />
                </View>
                <IconButton label={t("kitchen.useSoon.hide")} tone="plain" onPress={() => setHideSoon(true)} size={44}>
                  <Icon name="close" size={20} color={colors.onAccent} />
                </IconButton>
              </View>
            </Card>
          </Enter>
        ) : null}

        {kitchen.isPending ? (
          <StateView state="loading" title={t("state.loading.home")} />
        ) : kitchen.isError ? (
          <StateView
            state="error"
            title={t("state.error.title")}
            body={t("state.error.body")}
            actionLabel={t("state.retry")}
            onAction={() => kitchen.refetch()}
          />
        ) : all.length === 0 ? (
          <StateView
            state="empty"
            illustration={illustrations.emptyKitchen}
            title={t("state.empty.kitchen.title")}
            body={t("state.empty.kitchen.body")}
            actionLabel={t("state.empty.kitchen.action")}
            onAction={() => router.push("/pantry/add")}
          />
        ) : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters} accessibilityRole="tablist">
              {FILTERS.filter((f) => f === "all" || (counts.get(f) ?? 0) > 0).map((f) => (
                <Chip
                  key={f}
                  solid
                  icon={FILTER_ICON[f]}
                  selected={filter === f}
                  label={`${f === "all" ? t("kitchen.all") : t(`kitchen.location.${f}` as StringKey)} (${counts.get(f) ?? 0})`}
                  onPress={() => setFilter(f)}
                />
              ))}
            </ScrollView>

            {all.length < 12 ? (
              <Card tone="muted" onPress={() => router.push("/pantry/yesterday")} accessibilityLabel={t("quick.cta")}>
                <View style={styles.quick}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="bodyStrong">{t("quick.cta")}</Text>
                    <Text variant="caption" muted>
                      {t("quick.ctaBody")}
                    </Text>
                  </View>
                  <Icon name="forward" muted />
                </View>
              </Card>
            ) : null}

            {care.length ? (
              <View style={styles.group}>
                <SectionHeader title={t("kitchen.needsCare")} dot={colors.accent} note={t("kitchen.needsCareNote", { n: care.length })} noteTone="accent" />
                {care.map((x, i) => (
                  <Layout key={x.item.id}>
                    <Enter index={i}>
                      <ItemRow item={x.item} expiry={x.expiry} onCook={() => cookWith(x.item)} />
                    </Enter>
                  </Layout>
                ))}
                {all.some((i) => i.guess) ? (
                  <Button kind="quiet" size="small" label={t("kitchen.clearGuesses")} onPress={() => clearGuesses.mutate()} disabled={clearGuesses.isPending} />
                ) : null}
              </View>
            ) : null}

            {fresh.length ? (
              <View style={styles.group}>
                <SectionHeader title={t("kitchen.fresh")} dot={colors.primary} note={t("kitchen.freshNote", { n: fresh.length })} />
                {fresh.map((x, i) => (
                  <Layout key={x.item.id}>
                    <Enter index={i}>
                      <ItemRow item={x.item} expiry={x.expiry} onCook={() => cookWith(x.item)} />
                    </Enter>
                  </Layout>
                ))}
              </View>
            ) : null}

            {staples.length ? (
              <View style={styles.group}>
                <SectionHeader title={t("kitchen.staplesHeading")} dot={colors.peachText} note={t("kitchen.staplesNote")} />
                {staples.map((item, i) => (
                  <Enter key={item.id} index={i}>
                    <StapleRow item={item} householdId={householdId!} />
                  </Enter>
                ))}
              </View>
            ) : null}

            {suggestion ? (
              <Enter>
                <Card tone="muted">
                  <View style={styles.suggestHead}>
                    <View style={styles.row}>
                      <View style={[styles.miniWell, { backgroundColor: colors.primary }]}>
                        <Icon name="cook" size={16} color={colors.onPrimary} />
                      </View>
                      <Text variant="subheading">{t("kitchen.suggest.badge")}</Text>
                    </View>
                    <Text variant="overline" color={colors.primaryText} style={styles.upper}>
                      {t("kitchen.suggest.match", { pct: Math.round(suggestion.share * 100) })}
                    </Text>
                  </View>
                  <View style={styles.suggestBody}>
                    <Photo source={dishImage(suggestion.doc.slug)} size={84} radius={radius.item} />
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text variant="heading" numberOfLines={2}>
                        {dishTitle(suggestion.doc)}
                      </Text>
                      <Text variant="caption" muted numberOfLines={2}>
                        {t("kitchen.suggest.uses", { items: suggestion.uses.slice(0, 3).map((u) => itemName({ ingredientKey: u, name: u })).join(", ") })}
                      </Text>
                      <View style={styles.row}>
                        <Icon name="clock" size={14} color={colors.inkTertiary} />
                        <Text variant="caption" muted>
                          {t("kitchen.min", { n: totalTime(suggestion.doc) })}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <Button
                    kind="primary"
                    stretch
                    iconAfter="forward"
                    label={t("kitchen.suggest.cta")}
                    onPress={() => router.push(`/recipe/${suggestion.doc.slug}`)}
                  />
                </Card>
              </Enter>
            ) : null}
          </>
        )}
      </Screen>
      <UndoBar />
    </View>
  );
}

function dishTitle(doc: (typeof recipeDocs)[number]): string {
  const locale = getLocale();
  return (locale === "hi" ? doc.titles?.hi : locale === "hinglish" ? doc.titles?.["hi-Latn"] : undefined) ?? doc.title;
}

function QuickAction({
  icon,
  label,
  tone,
  onPress,
  soon,
  index,
}: {
  icon: IconName;
  label: string;
  tone: "primary" | "accent" | "peach";
  onPress?: () => void;
  soon?: boolean;
  index: number;
}) {
  const { colors } = useTheme();
  const [bg, fg] = { primary: [colors.primarySoft, colors.primaryText], accent: [colors.accentSoft, colors.accentText], peach: [colors.peach, colors.peachText] }[tone];
  return (
    <Enter index={index} style={{ flex: 1 }}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={soon ? `${label}, ${t("kitchen.soon")}` : label}
        accessibilityState={{ disabled: soon }}
        disabled={soon || !onPress}
        onPress={onPress}
        style={[styles.action, shadow.card, { backgroundColor: colors.surface, opacity: soon ? 0.7 : 1 }]}
      >
        <View style={[styles.actionWell, { backgroundColor: bg }]}>
          <Icon name={icon} size={20} color={fg} />
        </View>
        <Text variant="caption" weight={600} style={{ textAlign: "center" }} numberOfLines={1}>
          {label}
        </Text>
        {soon ? (
          <View style={styles.soonTag}>
            <Badge label={t("kitchen.soon")} tone="muted" />
          </View>
        ) : null}
      </PressableScale>
    </Enter>
  );
}

function ItemRow({ item, expiry, onCook }: { item: PantryItem; expiry: ExpiryInfo | null; onCook: () => void }) {
  const { colors } = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const householdId = useSession((s) => s.householdId);
  const confirm = useMutation({
    mutationFn: () => services.kitchen.updateItem(item.id, { confirm: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["kitchen", householdId] }),
  });
  const entry = catalogEntry(item.ingredientKey);
  const name = itemName(item);
  const qty = formatQuantity(item.quantity, item.unit);
  const unsure = (item.confidence < LOW_CONFIDENCE || item.guess) && !confirm.isSuccess;

  const badge =
    expiry?.kind === "expired" ? (
      <Badge label={t("kitchen.badge.expired")} tone="alert" />
    ) : expiry?.kind === "today" ? (
      <Badge label={t("kitchen.badge.today")} tone="alert" />
    ) : expiry?.kind === "later" ? (
      <Badge label={t("kitchen.badge.days", { n: expiry.days })} tone="primary" />
    ) : item.guess ? (
      <Badge label={t("kitchen.badge.guess")} tone="peach" />
    ) : null;
  const soonLine = expiry?.kind === "soon" ? (expiry.days === 1 ? t("kitchen.useInOne") : t("kitchen.useIn", { n: expiry.days })) : null;
  const extra = [
    item.state === "homemade" ? t("kitchen.homemade") : null,
    item.flavorRoles.length ? item.flavorRoles.map((r) => t(`flavor.${r}` as StringKey)).join(", ") : null,
    expiry?.estimated ? t("kitchen.estimated") : null,
  ].filter(Boolean);

  return (
    <View style={[styles.item, shadow.card, { backgroundColor: colors.surface }]}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={[name, qty, soonLine, ...extra].filter(Boolean).join(", ")}
        onPress={() => router.push(`/pantry/${item.id}`)}
        scaleTo={0.985}
        style={styles.itemMain}
      >
        <Photo
          source={ingredientImage(item.ingredientKey, entry?.category ?? (item.state === "leftover" ? "leftover" : "homemade"))}
          size={56}
          radius={radius.tag}
        />
        <View style={{ flex: 1, gap: 2 }}>
          <View style={styles.row}>
            <Text variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
              {name}
            </Text>
            {badge}
          </View>
          <View style={styles.row}>
            {qty ? (
              <Text variant="caption" muted>
                {qty}
              </Text>
            ) : null}
            {qty && soonLine ? (
              <Text variant="caption" muted>
                ·
              </Text>
            ) : null}
            {soonLine ? (
              <View style={styles.row}>
                <Icon name="alarm" size={13} color={colors.accentText} />
                <Text variant="caption" weight={500} color={colors.accentText}>
                  {soonLine}
                </Text>
              </View>
            ) : null}
          </View>
          <Text variant="overline" color={colors.inkTertiary} numberOfLines={1} style={{ letterSpacing: 0.2 }}>
            {[t(`kitchen.location.${item.location}` as StringKey), ...extra].join(" · ")}
          </Text>
        </View>
      </PressableScale>
      <View style={styles.itemSide}>
        <IconButton label={t("kitchen.cookWith", { item: name })} muted size={38} onPress={onCook}>
          <Icon name="skillet" size={18} color={colors.primaryText} />
        </IconButton>
        <IconButton label={t("kitchen.more", { item: name })} tone="plain" size={32} onPress={() => router.push(`/pantry/${item.id}`)}>
          <Icon name="more" size={18} color={colors.inkSecondary} />
        </IconButton>
      </View>
      {unsure ? (
        <View style={[styles.unsure, { backgroundColor: colors.peach }]}>
          <Text variant="caption" weight={500} color={colors.peachText} style={{ flex: 1 }}>
            {t("kitchen.stillHave")}
          </Text>
          <Button kind="light" size="small" label={t("kitchen.yes")} onPress={() => confirm.mutate()} />
        </View>
      ) : null}
    </View>
  );
}

function StapleRow({ item, householdId }: { item: PantryItem; householdId: string }) {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const [onList, setOnList] = useState(false);
  const setLevel = useMutation({
    mutationFn: (level: StapleLevel) => services.kitchen.updateItem(item.id, { stapleLevel: level }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["kitchen", householdId] }),
  });
  const addToList = useMutation({
    mutationFn: () => services.kitchen.addToList(householdId, [{ name: item.ingredientKey ?? item.name, reason: "running_low" }]),
    onSuccess: () => {
      setOnList(true);
      void queryClient.invalidateQueries({ queryKey: ["list", householdId] });
    },
  });
  const level = setLevel.isPending ? setLevel.variables : item.stapleLevel;
  const entry = catalogEntry(item.ingredientKey);
  return (
    <View style={[styles.item, shadow.card, { backgroundColor: colors.surface }]}>
      <View style={styles.itemMain}>
        <Photo source={ingredientImage(item.ingredientKey, entry?.category)} size={44} radius={radius.tag} />
        <Text variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
          {itemName(item)}
        </Text>
        <View style={[styles.levels, { backgroundColor: colors.surfaceMuted }]} accessibilityRole="radiogroup">
          {LEVELS.map((l) => {
            const on = level === l;
            const tint = l === "full" ? colors.primary : l === "low" ? colors.accent : colors.alert;
            return (
              <PressableScale
                key={l}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={`${itemName(item)}: ${t(`kitchen.staple.${l}` as StringKey)}`}
                onPress={() => setLevel.mutate(l)}
                style={[styles.level, on && { backgroundColor: tint }]}
              >
                <Text variant="caption" weight={600} color={on ? colors.onPrimary : colors.inkSecondary}>
                  {t(`kitchen.staple.${l}` as StringKey)}
                </Text>
              </PressableScale>
            );
          })}
        </View>
      </View>
      {level === "low" || level === "out" ? (
        <View style={[styles.unsure, { backgroundColor: colors.surfaceMuted }]}>
          <Icon name="cart" size={16} color={colors.inkSecondary} />
          <Text variant="caption" muted style={{ flex: 1 }}>
            {onList ? t("kitchen.addedToList") : level === "out" ? t("kitchen.staple.outNote") : t("kitchen.staple.lowNote")}
          </Text>
          {onList ? (
            <Icon name="checkCircle" size={18} color={colors.primaryText} />
          ) : (
            <Button kind="light" size="small" icon="plus" label={t("kitchen.addToList")} disabled={addToList.isPending} onPress={() => addToList.mutate()} />
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: "row", alignItems: "center", gap: space.sm, marginBottom: 4 },
  count: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  actions: { flexDirection: "row", gap: space.sm },
  action: { alignItems: "center", gap: 6, borderRadius: radius.item, paddingVertical: space.md, paddingHorizontal: space.xs },
  actionWell: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  soonTag: { position: "absolute", top: 6, right: 6 },
  soonHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  soonActions: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingTop: space.xs },
  filters: { gap: space.sm, paddingVertical: 2, paddingRight: space.gutter },
  quick: { flexDirection: "row", alignItems: "center", gap: space.md },
  group: { gap: space.md },
  row: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  item: { borderRadius: radius.item, padding: space.md, gap: space.sm, flexDirection: "row", flexWrap: "wrap", alignItems: "center" },
  itemMain: { flexDirection: "row", alignItems: "center", gap: space.md, flex: 1, minWidth: 0 },
  itemSide: { flexDirection: "row", alignItems: "center", gap: 2 },
  unsure: { flexBasis: "100%", flexDirection: "row", alignItems: "center", gap: space.sm, borderRadius: radius.tag, paddingVertical: 6, paddingHorizontal: space.md },
  levels: { flexDirection: "row", borderRadius: radius.pill, padding: 3 },
  level: { borderRadius: radius.pill, paddingHorizontal: 10, minHeight: 34, justifyContent: "center" },
  suggestHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  miniWell: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  suggestBody: { flexDirection: "row", gap: space.md, alignItems: "center" },
  upper: { textTransform: "uppercase" },
});
