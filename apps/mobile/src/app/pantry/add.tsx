// KIT-031: add items by typing them the way you'd say them. Cookmate reads the list back, marks anything it
// isn't sure about, and only adds once the user has seen (or heard) it. Nothing is written before "Add".
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Speech from "expo-speech";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { draftName, rematch } from "@/components/kitchen/names";
import { catalogEntry } from "@/data/catalog";
import { AmountChips } from "@/components/pantry/AmountChips";
import { AppHeader } from "@/components/AppHeader";
import { Icon, type IconName } from "@/design-system/icons";
import { ingredientImage } from "@/design-system/media";
import { Enter, Layout } from "@/design-system/motion";
import { Badge, Button, Card, Chip, Field, IconButton, Photo, Screen, Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { radius, space } from "@/design-system/tokens";
import { needsCheck, parseQuantity, readBackText } from "@/domain/kitchen";
import { LANGUAGE_CODES } from "@/domain/onboarding";
import { getLocale, t, useLocale, type StringKey } from "@/i18n";
import { services, type AddedVia, type DraftItem, type FlavorRole, type LocationKind } from "@/services";
import { useScan } from "@/state/scan";
import { toDraft } from "@/services/drafts";
import { useSession } from "@/state/session";
import { KeyboardSafe } from "@/design-system/KeyboardSafe";

const PLACES: LocationKind[] = ["fridge", "pantry", "freezer", "staples", "ready_made"];
const FLAVORS: FlavorRole[] = ["rich", "heat", "acid", "crunch", "starch", "sweet"];
const PLACE_ICON: Record<LocationKind, IconName> = { fridge: "fridge", pantry: "pantry", freezer: "freezer", staples: "box", ready_made: "cart", counter: "counter" };
// Typed the way people say them; tapping one adds it to the box.
const EXAMPLES = ["2 kilo aloo", "1 dozen eggs", "dhai sau gram paneer", "palak", "kal ki bachi dal", "dahi khatam"];

export default function AddItemsScreen() {
  useLocale();
  const router = useRouter();
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const householdId = useSession((s) => s.householdId)!;
  const [text, setText] = useState("");
  const [drafts, setDrafts] = useState<DraftItem[] | null>(null);
  const [via, setVia] = useState<AddedVia>("text");
  // Coming from a scan: open straight on the check screen with what was found.
  useEffect(() => {
    const scanned = useScan.getState().take();
    if (scanned) {
      setDrafts(scanned.items);
      setVia(scanned.via);
    }
  }, []);
  // Leaving the screen stops the read-back.
  useEffect(() => () => void Speech.stop(), []);

  const parse = useMutation({
    mutationFn: () => services.kitchen.parseItems({ householdId, text, languageCode: LANGUAGE_CODES[getLocale()] }),
    onSuccess: (r) => setDrafts(r.items),
  });
  const kitchen = useQuery({ queryKey: ["kitchen", householdId], queryFn: () => services.kitchen.getKitchen(householdId) });
  const add = useMutation({
    mutationFn: async (items: DraftItem[]) => {
      const toAdd = items.filter((d) => !d.out);
      const ranOut = items.filter((d) => d.out);
      if (toAdd.length) await services.kitchen.addItems({ householdId, items: toAdd, addedVia: via });
      if (ranOut.length) {
        // What ran out is marked finished (if Cookmate had it) and goes on the shopping list.
        const have = kitchen.data ?? [];
        for (const d of ranOut) {
          const item = have.find((p) => (d.ingredientKey ? p.ingredientKey === d.ingredientKey : p.name.toLowerCase() === d.said.toLowerCase()));
          if (item) await services.kitchen.finishItem(item.id, false);
        }
        await services.kitchen.addToList(householdId, ranOut.map((d) => ({ name: d.ingredientKey ?? d.said, reason: "running_low" as const })));
      }
    },
    onSuccess: async () => {
      Speech.stop();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["kitchen", householdId] }),
        queryClient.invalidateQueries({ queryKey: ["useSoon", householdId] }),
        queryClient.invalidateQueries({ queryKey: ["list", householdId] }),
      ]);
      router.back();
    },
  });

  const update = (key: string, patch: Partial<DraftItem>) =>
    setDrafts((ds) => ds?.map((d) => (d.key === key ? { ...d, ...patch } : d)) ?? null);
  const remove = (key: string) => setDrafts((ds) => ds?.filter((d) => d.key !== key) ?? null);
  const addBlank = () =>
    setDrafts((ds) => [
      ...(ds ?? []),
      toDraft({ said: "", ingredientKey: null, quantity: null, unit: null, locationKind: null, state: null, confidence: 1 }),
    ]);

  const ready = (drafts ?? []).filter((d) => d.said.trim() !== "" || d.ingredientKey);
  const readAloud = () => {
    Speech.stop();
    Speech.speak(readBackText(ready.map((d) => ({ name: draftName(d), quantity: d.quantity, unit: d.unit }))), {
      language: LANGUAGE_CODES[getLocale()] === "en-IN" ? "en-IN" : "hi-IN",
      rate: 0.9,
    });
  };

  return (
    <KeyboardSafe>
      <Screen tabBar={false} header={<AppHeader title={t("kitchen.addHeader")} back mic={false} profile={false} />}>
        {drafts === null ? (
          <>
            <Enter style={{ gap: space.sm }}>
              <Text variant="bodyStrong" color={colors.accentText}>
                {t("kitchen.addOverline")}
              </Text>
              <Text variant="title" accessibilityRole="header">
                {t("kitchen.addTitle")}
              </Text>
            </Enter>
            <Enter index={1}>
              <Field
                value={text}
                onChangeText={setText}
                placeholder={t("kitchen.addPlaceholder")}
                accessibilityLabel={t("kitchen.addTitle")}
                multiline
                autoFocus
                textAlignVertical="top"
                style={styles.bigField}
              />
            </Enter>
            <Enter index={2} style={{ gap: space.sm }}>
              <Text variant="overline" muted style={styles.upper}>
                {t("kitchen.addExamples")}
              </Text>
              <View style={styles.chips}>
                {EXAMPLES.map((e) => (
                  <Chip key={e} icon="plus" label={e} onPress={() => setText((v) => (v.trim() ? `${v.trim()}, ${e}` : e))} />
                ))}
              </View>
            </Enter>
            <View style={[styles.tip, { backgroundColor: colors.surfaceMuted }]}>
              <Icon name="bulb" size={20} color={colors.accentText} />
              <Text variant="caption" muted style={{ flex: 1 }}>
                {t("kitchen.addTip")}
              </Text>
            </View>
            {parse.isError ? <Text color={colors.alert}>{t("state.error.body")}</Text> : null}
            <Button
              kind="accent"
              stretch
              iconAfter="forward"
              label={parse.isPending ? t("kitchen.parsing") : t("kitchen.readBack")}
              size="cook"
              disabled={text.trim() === "" || parse.isPending}
              onPress={() => parse.mutate()}
            />
          </>
        ) : (
          <>
            <Enter style={{ gap: space.sm }}>
              <Text variant="title" accessibilityRole="header">
                {t("kitchen.confirmTitle")}
              </Text>
              <Text muted>{drafts.length ? t("kitchen.confirmBody") : t("kitchen.parseEmpty")}</Text>
            </Enter>
            {drafts.map((d, i) => (
              <Layout key={d.key}>
                <Enter index={i}>
                  {d.out ? (
                    <OutCard draft={d} onKeep={() => update(d.key, { out: false })} onRemove={() => remove(d.key)} />
                  ) : (
                    <DraftCard draft={d} onChange={(p) => update(d.key, p)} onRemove={() => remove(d.key)} />
                  )}
                </Enter>
              </Layout>
            ))}
            <View style={styles.row}>
              <Button kind="secondary" size="small" icon="plus" label={t("kitchen.newItem")} onPress={addBlank} />
              {ready.length ? <Button kind="secondary" size="small" icon="speaker" label={t("kitchen.sayBack")} onPress={readAloud} /> : null}
            </View>
            {add.isError ? (
              <Text color={colors.alert} accessibilityLiveRegion="assertive">
                {t("kitchen.addError")}
              </Text>
            ) : null}
            <Button
              kind="accent"
              stretch
              icon="checkCircle"
              label={
                ready.every((d) => d.out)
                  ? t("kitchen.confirmOut")
                  : ready.filter((d) => !d.out).length === 1
                    ? t("kitchen.confirmAddOne")
                    : t("kitchen.confirmAdd", { count: ready.filter((d) => !d.out).length })
              }
              size="cook"
              disabled={ready.length === 0 || add.isPending}
              onPress={() => add.mutate(ready)}
            />
          </>
        )}
      </Screen>
    </KeyboardSafe>
  );
}

/** Something the cook said ran out: confirming marks it finished and puts it on the list. */
function OutCard({ draft, onKeep, onRemove }: { draft: DraftItem; onKeep: () => void; onRemove: () => void }) {
  const { colors } = useTheme();
  const entry = catalogEntry(draft.ingredientKey);
  return (
    <Card style={{ backgroundColor: colors.surfaceMuted }}>
      <View style={styles.cardHead}>
        <Photo source={ingredientImage(draft.ingredientKey, entry?.category ?? "homemade")} size={52} radius={radius.tag} />
        <View style={{ flex: 1, gap: 4 }}>
          <Badge label={t("kitchen.ranOut")} tone="accent" icon="cart" />
          <Text variant="bodyStrong">{draftName(draft)}</Text>
          <Text variant="caption" muted>
            {t("kitchen.ranOutBody")}
          </Text>
        </View>
        <IconButton label={t("kitchen.remove")} muted size={36} onPress={onRemove}>
          <Icon name="trash" size={18} color={colors.inkSecondary} />
        </IconButton>
      </View>
      <View style={{ alignSelf: "flex-start" }}>
        <Button kind="quiet" size="small" label={t("kitchen.stillHave")} onPress={onKeep} />
      </View>
    </Card>
  );
}

function DraftCard({ draft, onChange, onRemove }: { draft: DraftItem; onChange: (p: Partial<DraftItem>) => void; onRemove: () => void }) {
  const { colors } = useTheme();
  const entry = catalogEntry(draft.ingredientKey);
  const place = draft.locationKind ?? entry?.location ?? "pantry";
  const unsure = needsCheck(draft);
  // When unsure, show what the user typed rather than the guess, so a wrong match is easy to spot.
  const [name, setName] = useState(unsure && draft.said ? draft.said : draftName(draft));
  const [qty, setQty] = useState(draft.quantity === null ? "" : String(draft.quantity));
  const custom = draft.ingredientKey === null || draft.state === "homemade";

  return (
    <Card style={unsure ? { borderWidth: 1.5, borderColor: colors.accent } : undefined}>
      <View style={styles.cardHead}>
        <Photo source={ingredientImage(draft.ingredientKey, entry?.category ?? "homemade")} size={52} radius={radius.tag} />
        <View style={{ flex: 1, gap: 4 }}>
          {unsure ? <Badge label={t("kitchen.unsure")} tone="accent" icon="bulb" /> : null}
          <Field
            variant="bodyStrong"
            value={name}
            onChangeText={(v) => {
              setName(v);
              onChange({ said: v, ingredientKey: rematch(v), confidence: 1 });
            }}
            placeholder={t("kitchen.newItem")}
            accessibilityLabel={t("kitchen.newItem")}
          />
        </View>
        <IconButton label={t("kitchen.remove")} muted size={36} onPress={onRemove}>
          <Icon name="trash" size={18} color={colors.inkSecondary} />
        </IconButton>
      </View>
      <AmountChips
        ingredientKey={draft.ingredientKey}
        quantity={draft.quantity}
        unit={draft.unit}
        ask={draft.quantity === null}
        onPick={(a) => {
          setQty(String(a.quantity));
          onChange({ quantity: a.quantity, unit: a.unit });
        }}
      />
      <View style={styles.pair}>
        <Field
          value={qty}
          onChangeText={(v) => {
            setQty(v);
            const n = parseQuantity(v);
            if (n !== undefined) onChange({ quantity: n });
          }}
          placeholder={t("kitchen.quantity")}
          accessibilityLabel={t("kitchen.quantity")}
          keyboardType="decimal-pad"
          style={styles.half}
        />
        <Field
          value={draft.unit ?? ""}
          onChangeText={(v) => onChange({ unit: v.trim() || null })}
          placeholder="kg / g / packet"
          accessibilityLabel={t("kitchen.unit")}
          autoCapitalize="none"
          style={styles.half}
        />
      </View>
      <View style={styles.chips} accessibilityRole="radiogroup">
        {PLACES.map((p) => (
          <Chip
            key={p}
            solid
            icon={PLACE_ICON[p]}
            label={t(`kitchen.location.${p}` as StringKey)}
            selected={place === p}
            onPress={() => onChange({ locationKind: p })}
          />
        ))}
      </View>
      {custom ? (
        <>
          <Text variant="label" muted>
            {t("kitchen.flavor")}
          </Text>
          <View style={styles.chips}>
            {FLAVORS.map((f) => {
              const on = draft.flavorRoles.includes(f);
              return (
                <Chip
                  key={f}
                  label={t(`flavor.${f}` as StringKey)}
                  selected={on}
                  onPress={() =>
                    onChange({ flavorRoles: on ? draft.flavorRoles.filter((x) => x !== f) : [...draft.flavorRoles, f] })
                  }
                />
              );
            })}
          </View>
        </>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  bigField: { minHeight: 160, borderRadius: radius.card, paddingTop: space.lg },
  tip: { flexDirection: "row", gap: space.md, alignItems: "center", borderRadius: radius.card, padding: space.lg },
  upper: { textTransform: "uppercase" },
  cardHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  row: { flexDirection: "row", gap: space.sm, flexWrap: "wrap" },
  pair: { flexDirection: "row", gap: space.sm },
  half: { flex: 1, minWidth: 0 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  badge: { alignSelf: "flex-start", borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: space.xs },
});
