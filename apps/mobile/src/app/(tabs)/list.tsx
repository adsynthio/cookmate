// Shopping list (KIT-110/111/112): what to buy, grouped the way a shop is laid out. Ticking a line (or "Bought
// everything") moves it into the kitchen with an estimated expiry; the list can be shared as plain text.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Linking, Share, StyleSheet, View } from "react-native";

import { AppHeader } from "@/components/AppHeader";
import { BuyFewCard } from "@/components/list/BuyFewCard";
import { catalogEntry } from "@/data/catalog";
import { Icon } from "@/design-system/icons";
import { illustrations, ingredientImage } from "@/design-system/media";
import { Enter, Layout, PressableScale } from "@/design-system/motion";
import { Button, Card, Field, IconButton, Photo, Screen, StateView, Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { radius, shadow, space } from "@/design-system/tokens";
import { capitalise, displayName } from "@/domain/kitchen";
import { groupBySection, lineAmount, shareText, type ListLine } from "@/domain/shopping";
import { STORES, storeSearchUrl, type Store } from "@/domain/grocery";
import { getLocale, t, useLocale, type StringKey } from "@/i18n";
import { services } from "@/services";
import { useSession } from "@/state/session";

export default function ListScreen() {
  useLocale();
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const locale = getLocale();
  const householdId = useSession((s) => s.householdId)!;
  const [text, setText] = useState("");
  const [note, setNote] = useState<string | null>(null);

  const list = useQuery({ queryKey: ["list", householdId], queryFn: () => services.kitchen.getList(householdId), staleTime: 0 });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["list", householdId] });
    void queryClient.invalidateQueries({ queryKey: ["kitchen", householdId] });
    void queryClient.invalidateQueries({ queryKey: ["picks"] });
  };
  const add = useMutation({
    mutationFn: () => services.kitchen.addToList(householdId, [{ name: text.trim(), reason: "manual" }]),
    onSuccess: () => {
      setText("");
      refresh();
    },
  });
  const buy = useMutation({
    mutationFn: (ids?: string[]) => services.kitchen.markBought(householdId, ids),
    onSuccess: () => {
      setNote(t("list.moved"));
      refresh();
    },
  });
  const remove = useMutation({ mutationFn: (id: string) => services.kitchen.removeFromList(id), onSuccess: refresh });

  const nameOf = (l: ListLine) => (l.ingredientKey ? displayName(catalogEntry(l.ingredientKey), l.ingredientKey, locale) : capitalise(l.name));
  const groups = groupBySection(list.data ?? [], (k) => catalogEntry(k)?.category, nameOf);

  const [store, setStore] = useState<Store | null>(null);
  const share = async () => {
    const message = shareText(groups, (s) => t(`list.section.${s}` as StringKey), nameOf, locale);
    try {
      await Share.share({ message });
    } catch {
      // No share sheet (some browsers): put it on the clipboard instead.
      try {
        await (globalThis.navigator as { clipboard?: { writeText(s: string): Promise<void> } } | undefined)?.clipboard?.writeText(message);
        setNote(t("list.copied"));
      } catch {
        setNote(t("state.error.body"));
      }
    }
  };

  const busy = buy.isPending || remove.isPending;
  const count = list.data?.length ?? 0;
  return (
    <Screen header={<AppHeader title={t("list.title")} />}>
      <Enter style={{ gap: space.xs }}>
        <Text variant="heading" accessibilityRole="header">
          {t("list.title")}
        </Text>
        <Text muted>{count === 1 ? t("list.subOne") : count ? t("list.sub", { n: count }) : t("list.subEmpty")}</Text>
      </Enter>

      <View style={[styles.addRow, shadow.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
        <Field
          value={text}
          onChangeText={setText}
          placeholder={t("list.add")}
          accessibilityLabel={t("list.add")}
          autoCapitalize="none"
          returnKeyType="done"
          onSubmitEditing={() => text.trim().length >= 2 && add.mutate()}
          style={styles.addField}
        />
        <IconButton label={t("list.addButton")} tone="primary" size={44} onPress={() => text.trim().length >= 2 && add.mutate()}>
          <Icon name="plus" size={22} color={colors.onPrimary} />
        </IconButton>
      </View>
      {add.isError || buy.isError || remove.isError ? (
        <Text color={colors.alert} accessibilityLiveRegion="polite">
          {t("state.error.body")}
        </Text>
      ) : note ? (
        <Text color={colors.primaryText} accessibilityLiveRegion="polite">
          {note}
        </Text>
      ) : null}

      {/* S8: the smallest shop that opens up the most dishes. */}
      {list.data ? <BuyFewCard householdId={householdId} onList={list.data.flatMap((l) => (l.ingredientKey ? [l.ingredientKey] : []))} /> : null}

      {list.isPending ? (
        <StateView state="loading" title={t("list.title")} />
      ) : list.isError ? (
        <StateView state="error" title={t("state.error.title")} body={t("state.error.body")} actionLabel={t("state.retry")} onAction={() => void list.refetch()} />
      ) : groups.length === 0 ? (
        <StateView state="empty" illustration={illustrations.emptyList} title={t("list.empty")} body={t("list.emptyBody")} />
      ) : (
        <>
          <Enter index={1}>
            <Card tone="primary">
              <View style={styles.infoRow}>
                <View style={[styles.infoIcon, { backgroundColor: "rgba(255,255,255,0.16)" }]}>
                  <Icon name="leaf" size={22} color={colors.onPrimary} />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text variant="subheading" color={colors.onPrimary}>
                    {t("list.infoTitle")}
                  </Text>
                  <Text variant="caption" color={colors.onPrimary} style={{ opacity: 0.85 }}>
                    {t("list.infoBody")}
                  </Text>
                </View>
              </View>
              <Button kind="light" size="small" icon="share" label={t("list.share")} onPress={() => void share()} />
            </Card>
          </Enter>

          {/* F9: find each item in a grocery app. Cookmate never orders; the cook does, in the app. */}
          <View style={{ gap: space.xs }}>
            <Text variant="caption" muted>
              {t("grocery.pick")}
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
              {STORES.map((st) => (
                <Button
                  key={st}
                  kind={store === st ? "primary" : "secondary"}
                  size="small"
                  label={t(`grocery.store.${st}` as StringKey)}
                  onPress={() => setStore(store === st ? null : st)}
                />
              ))}
            </View>
            {store ? <Text variant="caption" muted>{t("grocery.note")}</Text> : null}
          </View>

          {groups.map((g, gi) => (
            <View key={g.section} style={{ gap: space.sm }}>
              <View style={styles.sectionRow}>
                <Text variant="subheading" accessibilityRole="header">
                  {t(`list.section.${g.section}` as StringKey)}
                </Text>
                <View style={[styles.pill, { backgroundColor: colors.surfaceHigh }]}>
                  <Text variant="caption" weight={600} muted>
                    {g.lines.length === 1 ? t("list.itemsOne") : t("list.items", { n: g.lines.length })}
                  </Text>
                </View>
              </View>
              {g.lines.map((l, i) => {
                const name = nameOf(l);
                const detail = [lineAmount(l), l.reason === "running_low" || l.reason === "recipe_missing" ? t(`list.reason.${l.reason}` as StringKey) : ""].filter(Boolean);
                return (
                  <Layout key={l.id}>
                    <Enter index={gi * 3 + i}>
                      <View style={[styles.line, shadow.card, { backgroundColor: colors.surface }]}>
                        <PressableScale
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: false, disabled: busy }}
                          accessibilityLabel={t("list.bought", { name })}
                          disabled={busy}
                          onPress={() => buy.mutate([l.id])}
                          hitSlop={10}
                          scaleTo={0.85}
                          style={[styles.check, { borderColor: colors.inkTertiary }]}
                        />
                        <Photo source={ingredientImage(l.ingredientKey, l.ingredientKey ? catalogEntry(l.ingredientKey)?.category : "homemade")} size={40} round />
                        <View style={{ flex: 1, gap: 2 }}>
                          <Text variant="bodyStrong">{name}</Text>
                          {detail.length ? (
                            <Text variant="caption" color={l.reason === "running_low" ? colors.accentText : colors.inkSecondary}>
                              {detail.join(" · ")}
                            </Text>
                          ) : null}
                        </View>
                        {store ? (
                          <IconButton
                            label={t("grocery.find", { item: name, store: t(`grocery.store.${store}` as StringKey) })}
                            muted
                            size={32}
                            onPress={() => void Linking.openURL(storeSearchUrl(store, l.ingredientKey ?? l.name))}
                          >
                            <Icon name="search" size={16} />
                          </IconButton>
                        ) : null}
                        <IconButton label={t("list.remove", { name })} muted size={32} onPress={() => remove.mutate(l.id)}>
                          <Icon name="close" size={16} />
                        </IconButton>
                      </View>
                    </Enter>
                  </Layout>
                );
              })}
            </View>
          ))}

          <View style={[styles.summary, shadow.float, { backgroundColor: colors.surface }]}>
            <View style={{ gap: 2 }}>
              <Text variant="title">{count}</Text>
              <Text variant="caption" muted>
                {count === 1 ? t("list.leftOne") : t("list.left", { n: count })}
              </Text>
            </View>
            <Button kind="accent" stretch size="cook" icon="checkCircle" label={t("list.allBought")} disabled={busy} onPress={() => buy.mutate(undefined)} />
            <Text variant="caption" muted style={{ textAlign: "center" }}>
              {t("list.allBoughtBody")}
            </Text>
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  addRow: { flexDirection: "row", alignItems: "center", borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, paddingRight: 4 },
  addField: { flex: 1, borderWidth: 0, backgroundColor: "transparent" },
  infoRow: { flexDirection: "row", gap: space.md, alignItems: "flex-start" },
  infoIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  sectionRow: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingTop: space.sm },
  pill: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  line: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 64, borderRadius: radius.item, paddingHorizontal: space.md, paddingVertical: space.sm },
  check: { width: 26, height: 26, borderRadius: 13, borderWidth: 2 },
  summary: { borderRadius: radius.cardLg, padding: space.gutter, gap: space.md },
});
