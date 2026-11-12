// Shopping list (KIT-110/111/112): what to buy, grouped the way a shop is laid out. Ticking a line (or "Bought
// everything") moves it into the kitchen with an estimated expiry; the list can be shared as plain text.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, Share, StyleSheet, View } from "react-native";

import { catalogEntry } from "@/data/catalog";
import { Icon } from "@/design-system/icons";
import { illustrations } from "@/design-system/media";
import { Button, Card, Field, IconButton, Screen, StateView, Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { space } from "@/design-system/tokens";
import { capitalise, displayName } from "@/domain/kitchen";
import { groupBySection, lineAmount, shareText, type ListLine } from "@/domain/shopping";
import { getLocale, t, useLocale, type StringKey } from "@/i18n";
import { services } from "@/services";
import { useSession } from "@/state/session";

export default function ListScreen() {
  useLocale();
  const { colors } = useTheme();
  const router = useRouter();
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
  return (
    <Screen>
      <View style={styles.top}>
        <IconButton label={t("onb.back")} onPress={() => router.back()}>
          <Icon name="back" />
        </IconButton>
      </View>
      <Text variant="title" accessibilityRole="header">
        {t("list.title")}
      </Text>

      <View style={styles.addRow}>
        <View style={{ flex: 1 }}>
          <Field
            value={text}
            onChangeText={setText}
            placeholder={t("list.add")}
            accessibilityLabel={t("list.add")}
            autoCapitalize="none"
            returnKeyType="done"
            onSubmitEditing={() => text.trim().length >= 2 && add.mutate()}
          />
        </View>
        <Button label={t("list.addButton")} kind="secondary" disabled={text.trim().length < 2 || add.isPending} onPress={() => add.mutate()} />
      </View>
      {add.isError || buy.isError || remove.isError ? (
        <Text color={colors.alert} accessibilityLiveRegion="polite">
          {t("state.error.body")}
        </Text>
      ) : note ? (
        <Text muted accessibilityLiveRegion="polite">
          {note}
        </Text>
      ) : null}

      {list.isPending ? (
        <StateView state="loading" title={t("list.title")} />
      ) : list.isError ? (
        <StateView state="error" title={t("state.error.title")} body={t("state.error.body")} actionLabel={t("state.retry")} onAction={() => void list.refetch()} />
      ) : groups.length === 0 ? (
        <StateView state="empty" illustration={illustrations.emptyList} title={t("list.empty")} body={t("list.emptyBody")} />
      ) : (
        <>
          {groups.map((g) => (
            <View key={g.section} style={{ gap: space.sm }}>
              <Text variant="label" muted>
                {t(`list.section.${g.section}` as StringKey)}
              </Text>
              <Card>
                {g.lines.map((l) => {
                  const name = nameOf(l);
                  const detail = [lineAmount(l), l.reason === "running_low" || l.reason === "recipe_missing" ? t(`list.reason.${l.reason}` as StringKey) : ""].filter(Boolean).join(" · ");
                  return (
                    <View key={l.id} style={styles.line}>
                      <Pressable
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: false, disabled: busy }}
                        accessibilityLabel={t("list.bought", { name })}
                        disabled={busy}
                        onPress={() => buy.mutate([l.id])}
                        hitSlop={10}
                        style={({ pressed }) => [styles.check, { borderColor: colors.inkTertiary, backgroundColor: pressed ? colors.primarySoft : "transparent" }]}
                      />
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text variant="bodyStrong">{name}</Text>
                        {detail ? (
                          <Text variant="caption" muted>
                            {detail}
                          </Text>
                        ) : null}
                      </View>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t("list.remove", { name })}
                        disabled={busy}
                        onPress={() => remove.mutate(l.id)}
                        hitSlop={10}
                        style={({ pressed }) => [styles.remove, { backgroundColor: colors.surfaceMuted, opacity: pressed ? 0.6 : 1 }]}
                      >
                        <Icon name="close" size={16} />
                      </Pressable>
                    </View>
                  );
                })}
              </Card>
            </View>
          ))}
          <Button size="cook" label={t("list.allBought")} disabled={busy} onPress={() => buy.mutate(undefined)} />
          <Text variant="caption" muted style={{ textAlign: "center" }}>
            {t("list.allBoughtBody")}
          </Text>
          <Button kind="secondary" label={t("list.share")} onPress={() => void share()} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row" },
  addRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  line: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 56 },
  check: { width: 28, height: 28, borderRadius: 14, borderWidth: 2 },
  remove: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
});
