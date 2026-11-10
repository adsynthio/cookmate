// KIT-031: add items by typing them the way you'd say them. Cookmate reads the list back, marks anything it
// isn't sure about, and only adds once the user has seen (or heard) it. Nothing is written before "Add".
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as Speech from "expo-speech";
import { useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, View } from "react-native";

import { draftName, rematch } from "@/components/kitchen/names";
import { catalogEntry } from "@/data/catalog";
import { Icon } from "@/design-system/icons";
import { Button, Card, Chip, Field, IconButton, Screen, Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { radius, space } from "@/design-system/tokens";
import { needsCheck, parseQuantity, readBackText } from "@/domain/kitchen";
import { LANGUAGE_CODES } from "@/domain/onboarding";
import { getLocale, t, useLocale, type StringKey } from "@/i18n";
import { services, type DraftItem, type FlavorRole, type LocationKind } from "@/services";
import { toDraft } from "@/services/drafts";
import { useSession } from "@/state/session";

const PLACES: LocationKind[] = ["fridge", "pantry", "freezer", "staples", "ready_made"];
const FLAVORS: FlavorRole[] = ["rich", "heat", "acid", "crunch", "starch", "sweet"];

export default function AddItemsScreen() {
  useLocale();
  const router = useRouter();
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const householdId = useSession((s) => s.householdId)!;
  const [text, setText] = useState("");
  const [drafts, setDrafts] = useState<DraftItem[] | null>(null);

  const parse = useMutation({
    mutationFn: () => services.kitchen.parseItems({ householdId, text, languageCode: LANGUAGE_CODES[getLocale()] }),
    onSuccess: (r) => setDrafts(r.items),
  });
  const add = useMutation({
    mutationFn: (items: DraftItem[]) => services.kitchen.addItems({ householdId, items, addedVia: "text" }),
    onSuccess: async () => {
      Speech.stop();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["kitchen", householdId] }),
        queryClient.invalidateQueries({ queryKey: ["useSoon", householdId] }),
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
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen>
        <View style={styles.top}>
          <IconButton
            label={t("onb.back")}
            onPress={() => {
              Speech.stop();
              router.back();
            }}
          >
            <Icon name="close" />
          </IconButton>
        </View>

        {drafts === null ? (
          <>
            <Text variant="title" accessibilityRole="header">
              {t("kitchen.addTitle")}
            </Text>
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
            {parse.isError ? <Text color={colors.alert}>{t("state.error.body")}</Text> : null}
            <Button
              label={parse.isPending ? t("kitchen.parsing") : t("kitchen.readBack")}
              size="cook"
              disabled={text.trim() === "" || parse.isPending}
              onPress={() => parse.mutate()}
            />
          </>
        ) : (
          <>
            <Text variant="title" accessibilityRole="header">
              {t("kitchen.confirmTitle")}
            </Text>
            <Text muted>{drafts.length ? t("kitchen.confirmBody") : t("kitchen.parseEmpty")}</Text>
            {drafts.map((d) => (
              <DraftCard key={d.key} draft={d} onChange={(p) => update(d.key, p)} onRemove={() => remove(d.key)} />
            ))}
            <View style={styles.row}>
              <Button kind="secondary" label={`+ ${t("kitchen.newItem")}`} onPress={addBlank} />
              {ready.length ? <Button kind="secondary" label={t("kitchen.sayBack")} onPress={readAloud} /> : null}
            </View>
            {add.isError ? (
              <Text color={colors.alert} accessibilityLiveRegion="assertive">
                {t("kitchen.addError")}
              </Text>
            ) : null}
            <Button
              label={ready.length === 1 ? t("kitchen.confirmAddOne") : t("kitchen.confirmAdd", { count: ready.length })}
              size="cook"
              disabled={ready.length === 0 || add.isPending}
              onPress={() => add.mutate(ready)}
            />
          </>
        )}
      </Screen>
    </KeyboardAvoidingView>
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
    <Card style={unsure ? { borderWidth: 2, borderColor: colors.amber } : undefined}>
      {unsure ? (
        <View style={[styles.badge, { backgroundColor: colors.amberSoft }]}>
          <Text variant="caption" weight={500}>
            {t("kitchen.check")}
          </Text>
        </View>
      ) : null}
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
      <View style={{ alignItems: "flex-start" }}>
        <Button kind="quiet" label={t("kitchen.remove")} onPress={onRemove} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row" },
  bigField: { minHeight: 160, borderRadius: radius.card, paddingTop: space.lg },
  row: { flexDirection: "row", gap: space.sm, flexWrap: "wrap" },
  pair: { flexDirection: "row", gap: space.sm },
  half: { flex: 1, minWidth: 0 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  badge: { alignSelf: "flex-start", borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: space.xs },
});
