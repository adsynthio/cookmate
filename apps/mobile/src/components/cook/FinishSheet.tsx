// Finish sheet (KIT-077, KIT-037): one sheet to celebrate, rate the dish, review what comes off the pantry and save
// leftovers. Every part is optional; "Done" saves only what was touched, and "Skip all" changes nothing.
import { useMutation } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";

import { catalogEntry } from "@/data/catalog";
import { Icon } from "@/design-system/icons";
import { illustrations } from "@/design-system/media";
import { Button, Card, Chip, Field, Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { radius, space } from "@/design-system/tokens";
import { adjustmentFor, readableLine, rememberedQty, type LineReview } from "@/domain/cooking";
import { displayName, formatQuantity } from "@/domain/kitchen";
import { feedbackCandidates, type AmountChange } from "@/domain/learning";
import { getLocale, t, type StringKey } from "@/i18n";
import { services, type DeductionAdjustment, type DeductionLine, type Rating, type StapleLevel } from "@/services";

const RATINGS: Rating[] = ["loved", "good", "meh", "bad"];
const TAGS = ["too_spicy", "not_spicy_enough", "too_salty", "too_oily", "more_garlic", "took_too_long"] as const;
const LEVELS: StapleLevel[] = ["full", "low", "out"];
const LEFTOVER_KATORI = [0, 1, 2, 4];

export function FinishSheet({
  sessionId,
  householdId,
  dish,
  lines,
  leftoverNote,
  recipeId,
  memberId,
  changes,
  offline = false,
  onClose,
}: {
  /** Finished with no network (KIT-076): the kitchen is updated with the recipe's amounts once back online. */
  offline?: boolean;
  /** Remembered amounts for this dish (KIT-104), keyed by ingredient. */
  changes?: Map<string, AmountChange>;
  sessionId: string;
  householdId: string;
  dish: string;
  lines: DeductionLine[];
  /** Pinned safety line for leftovers of this dish (cooked rice), shown word for word when leftovers are saved. */
  leftoverNote?: string | null;
  /** The dish (its base recipe) and the cook, for what is remembered about it. */
  recipeId?: string;
  memberId?: string;
  onClose: (saved: boolean) => void;
}) {
  const { colors } = useTheme();
  const locale = getLocale();
  const [rating, setRating] = useState<Rating | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [again, setAgain] = useState(false);
  // Amounts are reviewed in the unit that reads best (55 g, not 0.055 kg) and sent back in the item's own unit.
  const view = useMemo(() => lines.map(readableLine), [lines]);
  const [state, setState] = useState<Record<string, LineReview>>(() =>
    Object.fromEntries(
      view.map(({ line: l }) => {
        // KIT-104: what was remembered for this dish ("more garlic") is what was used, so it starts that way.
        const change = changes?.get(l.ingredient);
        const qty = l.quantity === null ? "" : String(change && !l.staple ? rememberedQty(l.quantity, change.factor) : l.quantity);
        return [l.itemId, { on: true, qty, level: null }];
      }),
    ),
  );
  const [leftover, setLeftover] = useState(0);
  // Each part is saved once, so "Try again" after a failure doesn't repeat the parts that went through.
  const saved = useRef({ feedback: false, deduction: false, leftover: false, memories: new Set<string>() });
  // KIT-103: feedback only suggests memories; the cook taps the ones to keep.
  const [remember, setRemember] = useState<string[]>([]);
  const candidates = feedbackCandidates(tags, again, dish, locale);

  const patch = (id: string, change: Partial<LineReview>) => setState((s) => ({ ...s, [id]: { ...s[id]!, ...change } }));
  const nameOf = (key: string) => displayName(catalogEntry(key), key, locale);

  const save = useMutation({
    mutationFn: async () => {
      if (rating && !saved.current.feedback) {
        await services.cooking.submitFeedback({ sessionId, rating, tags, makeAgain: again || undefined });
        saved.current.feedback = true;
      }
      for (const c of candidates) {
        if (!remember.includes(c.about) || saved.current.memories.has(c.about)) continue;
        await services.preference.saveMemory({ householdId, memberId, statement: c.statement, category: c.category, polarity: c.polarity, about: c.about, recipeId });
        saved.current.memories.add(c.about);
      }
      if (lines.length && !saved.current.deduction) {
        const adjustments = view
          .map(({ line, factor }) => {
            const a = adjustmentFor(line, state[line.itemId]!);
            return a && a.quantity !== undefined ? { ...a, quantity: a.quantity / factor } : a;
          })
          .filter((a): a is DeductionAdjustment => a !== null);
        await services.cooking.applyDeduction(sessionId, adjustments);
        saved.current.deduction = true;
      }
      if (leftover > 0 && !saved.current.leftover) {
        await services.kitchen.addItems({
          householdId,
          addedVia: "manual",
          items: [
            {
              key: "leftover",
              said: t("finish.leftoverName", { dish }),
              ingredientKey: null,
              quantity: leftover,
              unit: "katori",
              locationKind: "fridge",
              state: "leftover",
              flavorRoles: [],
              confidence: 1,
            },
          ],
        });
        saved.current.leftover = true;
      }
    },
    onSuccess: () => onClose(true),
  });

  return (
    <>
      <Card hero style={styles.hero}>
        {illustrations.allDone ? <Image source={illustrations.allDone} style={styles.art} resizeMode="contain" accessible={false} /> : null}
        <Text variant="title" accessibilityRole="header" style={{ textAlign: "center" }}>
          {t("finish.title", { dish })}
        </Text>
        <Text style={{ textAlign: "center" }}>{t("finish.body")}</Text>
      </Card>

      <Text variant="heading">{t("finish.rate")}</Text>
      <View style={styles.chips} accessibilityRole="radiogroup">
        {RATINGS.map((r) => (
          <Chip key={r} label={t(`finish.rating.${r}` as StringKey)} selected={rating === r} onPress={() => setRating(rating === r ? null : r)} />
        ))}
      </View>
      {rating ? (
        <>
          <Text muted>{t("finish.tags")}</Text>
          <View style={styles.chips}>
            {TAGS.map((tag) => (
              <Chip
                key={tag}
                label={t(`finish.tag.${tag}` as StringKey)}
                selected={tags.includes(tag)}
                onPress={() => setTags((l) => (l.includes(tag) ? l.filter((x) => x !== tag) : [...l, tag]))}
              />
            ))}
            <Chip label={t("finish.again")} selected={again} onPress={() => setAgain((a) => !a)} />
          </View>
        </>
      ) : null}

      {candidates.length ? (
        <>
          <Text variant="heading">{t("finish.remember")}</Text>
          <Text muted>{t("finish.rememberBody")}</Text>
          <View style={styles.chips}>
            {candidates.map((c) => (
              <Chip
                key={c.about}
                label={c.statement}
                selected={remember.includes(c.about)}
                onPress={() => setRemember((l) => (l.includes(c.about) ? l.filter((x) => x !== c.about) : [...l, c.about]))}
              />
            ))}
          </View>
        </>
      ) : null}

      <Text variant="heading">{t("finish.deduct")}</Text>
      {offline ? (
        <Text muted>{t("finish.offline")}</Text>
      ) : lines.length === 0 ? (
        <Text muted>{t("finish.deductNone")}</Text>
      ) : (
        <>
          <Text muted>{t("finish.deductBody")}</Text>
          <Card>
            {view.map(({ line: l }, i) => {
              const s = state[l.itemId]!;
              const original = lines[i]!;
              const name = nameOf(l.ingredient);
              return (
                <View key={l.itemId} style={styles.line}>
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: s.on }}
                    accessibilityLabel={t("finish.used", { name })}
                    onPress={() => patch(l.itemId, { on: !s.on })}
                    hitSlop={8}
                    style={[styles.check, { backgroundColor: s.on ? colors.lime : colors.surfaceMuted }]}
                  >
                    {s.on ? <Icon name="check" size={18} color={colors.onLime} /> : null}
                  </Pressable>
                  <View style={{ flex: 1, gap: 2, opacity: s.on ? 1 : 0.5 }}>
                    <Text variant="bodyStrong">{name}</Text>
                    {!l.staple && changes?.get(l.ingredient) ? (
                      <Text variant="caption" color={colors.limeText}>
                        {t(changes.get(l.ingredient)!.amount === "more" ? "recipe.more" : "recipe.less")}
                      </Text>
                    ) : null}
                    {l.staple ? (
                      <Text variant="caption" muted>
                        {t("finish.stapleNow")}
                      </Text>
                    ) : original.currentQuantity !== null ? (
                      <Text variant="caption" muted>
                        {t("finish.had", { qty: formatQuantity(original.currentQuantity, original.unit) })}
                      </Text>
                    ) : null}
                    {l.staple && s.on ? (
                      <View style={styles.chips}>
                        {LEVELS.map((lv) => (
                          <Chip
                            key={lv}
                            label={t(`kitchen.staple.${lv}` as StringKey)}
                            selected={s.level === lv}
                            onPress={() => patch(l.itemId, { level: s.level === lv ? null : lv })}
                          />
                        ))}
                      </View>
                    ) : null}
                  </View>
                  {!l.staple && s.on ? (
                    <View style={styles.amount}>
                      <Field
                        value={s.qty}
                        onChangeText={(qty) => patch(l.itemId, { qty })}
                        keyboardType="decimal-pad"
                        accessibilityLabel={t("finish.amount", { name })}
                        style={styles.qty}
                      />
                      <Text variant="label" muted>
                        {l.unit === "piece" ? "" : (l.unit ?? "")}
                      </Text>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </Card>
        </>
      )}

      <Text variant="heading">{t("finish.leftovers")}</Text>
      <Text muted>{t("finish.leftoversBody")}</Text>
      <View style={styles.chips} accessibilityRole="radiogroup">
        {LEFTOVER_KATORI.map((n) => (
          <Chip key={n} label={n === 0 ? t("finish.left.none") : t("finish.left.n", { n })} selected={leftover === n} onPress={() => setLeftover(n)} />
        ))}
      </View>

      {leftover > 0 && leftoverNote ? (
        <View style={[styles.note, { backgroundColor: colors.alertSoft }]} accessibilityRole="alert">
          <Text variant="bodyStrong" color={colors.alert}>
            {t("finish.riceNote")}
          </Text>
          <Text color={colors.alert}>{leftoverNote}</Text>
        </View>
      ) : null}

      {save.isError ? (
        <Text color={colors.alert} accessibilityLiveRegion="polite">
          {t("finish.failed")}
        </Text>
      ) : null}
      <Button label={save.isPending ? t("finish.saving") : t("finish.done")} size="cook" disabled={save.isPending} onPress={() => save.mutate()} />
      <Button kind="quiet" label={t("finish.skip")} disabled={save.isPending} onPress={() => onClose(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", gap: space.sm },
  art: { width: 132, height: 132 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  line: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 56, paddingVertical: space.xs },
  check: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  amount: { flexDirection: "row", alignItems: "center", gap: space.sm },
  note: { borderRadius: radius.card, padding: space.lg, gap: space.xs },
  qty: { width: 76, textAlign: "center", paddingHorizontal: space.sm },
});
