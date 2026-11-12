// Finish sheet (KIT-077, KIT-037): one sheet to celebrate, rate the dish, review what comes off the pantry and save
// leftovers. Every part is optional; "Done" saves only what was touched, and "Skip all" changes nothing.
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Image, type ImageSourcePropType, Pressable, StyleSheet, View } from "react-native";

import { catalogEntry } from "@/data/catalog";
import { Icon, type IconName } from "@/design-system/icons";
import { Enter, PressableScale } from "@/design-system/motion";
import { illustrations, ingredientImage } from "@/design-system/media";
import { Badge, Button, Card, Chip, Field, Photo, Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { radius, shadow, space } from "@/design-system/tokens";
import { adjustmentFor, readableLine, rememberedQty, type LineReview } from "@/domain/cooking";
import { displayName, formatQuantity } from "@/domain/kitchen";
import { feedbackCandidates, type AmountChange } from "@/domain/learning";
import { getLocale, t, type StringKey } from "@/i18n";
import { LANGUAGE_CODES } from "@/domain/onboarding";
import { services, type DeductionAdjustment, type DeductionLine, type Rating, type StapleLevel } from "@/services";

const RATINGS: Rating[] = ["loved", "good", "meh", "bad"];
const RATING_ICON: Record<Rating, IconName> = { loved: "heart", good: "check", meh: "minus", bad: "close" };
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
  cookChanges = [],
  offline = false,
  photo,
  steps,
  onShare,
  onClose,
}: {
  /** Share the dish with a circle, carrying the changes picked here ("Too spicy" is left out: it's for next time). */
  onShare?: (changes: string[]) => void;
  /** The dish photo for the top of the screen, and how many steps were cooked. */
  photo?: ImageSourcePropType | null;
  steps?: number;
  /** Finished with no network (KIT-076): the kitchen is updated with the recipe's amounts once back online. */
  offline?: boolean;
  /** Remembered amounts for this dish (KIT-104), keyed by ingredient. */
  changes?: Map<string, AmountChange>;
  /** What the cook said they changed while cooking (KIT-075): read into suggestions for next time (AI 4). */
  cookChanges?: string[];
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
  // AI 4: what Cookmate noticed while they cooked. Offered ticked; the cook drops anything that was a one-off.
  const learned = useQuery({
    queryKey: ["learned", sessionId],
    queryFn: () => services.preference.learnFromCooking({ sessionId, householdId, dish, changes: cookChanges, languageCode: LANGUAGE_CODES[locale] }),
    enabled: cookChanges.length > 0,
    staleTime: Infinity,
  });
  const [dropped, setDropped] = useState<string[]>([]);
  const keep = (learned.data ?? []).filter((c) => !dropped.includes(c.key));
  useEffect(() => setDropped([]), [learned.data]);

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
      for (const c of keep) {
        if (saved.current.memories.has(c.key)) continue;
        await services.preference.saveMemory({
          householdId,
          memberId: c.memberId ?? memberId,
          statement: c.statement,
          category: c.category === "taste" ? "taste" : c.category === "ingredient" ? "ingredient" : "other",
          polarity: c.polarity,
          about: c.about,
          ingredientKey: c.ingredientKey,
          amount: c.amount,
          // Amounts and notes are about this dish; a person's like or dislike is about them, everywhere.
          recipeId: c.about === "preference" ? undefined : recipeId,
          source: "observed",
        });
        saved.current.memories.add(c.key);
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
      <Enter style={styles.top}>
        {steps ? <Badge tone="primary" icon="checkCircle" label={t("finish.badge", { n: steps })} /> : null}
        <Text variant="display" accessibilityRole="header" style={styles.center}>
          {t("finish.headline")}
        </Text>
        <Text muted style={styles.center}>
          {t("finish.ready", { dish })}
        </Text>
      </Enter>

      <Enter index={1}>
        <View style={[styles.photo, shadow.card, { backgroundColor: colors.primarySoft }]}>
          {photo ?? illustrations.allDone ? (
            <Image source={(photo ?? illustrations.allDone)!} style={photo ? styles.photoImage : styles.art} resizeMode={photo ? "cover" : "contain"} accessibilityLabel={dish} />
          ) : null}
        </View>
      </Enter>

      <Enter index={2}>
        <Card style={styles.section}>
          <Text variant="heading">{t("finish.rate")}</Text>
          <Text muted>{t("finish.body")}</Text>
          <View style={styles.ratings} accessibilityRole="radiogroup">
            {RATINGS.map((r) => {
              const on = rating === r;
              return (
                <PressableScale
                  key={r}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={t(`finish.rating.${r}` as StringKey)}
                  onPress={() => setRating(on ? null : r)}
                  style={[styles.rating, { backgroundColor: on ? colors.peach : colors.surfaceMuted, borderColor: on ? colors.accent : "transparent" }]}
                >
                  <Icon name={RATING_ICON[r]} size={22} color={on ? colors.accentText : colors.inkSecondary} />
                  <Text variant="label" color={on ? colors.accentText : colors.inkSecondary} numberOfLines={1}>
                    {t(`finish.rating.${r}` as StringKey)}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
          {rating ? (
            <Enter style={{ gap: space.md }}>
              <Text variant="label" muted>
                {t("finish.tags")}
              </Text>
              <View style={styles.chips}>
                {TAGS.map((tag) => (
                  <Chip
                    key={tag}
                    label={t(`finish.tag.${tag}` as StringKey)}
                    selected={tags.includes(tag)}
                    showCheck
                    onPress={() => setTags((l) => (l.includes(tag) ? l.filter((x) => x !== tag) : [...l, tag]))}
                  />
                ))}
                <Chip label={t("finish.again")} icon="heart" selected={again} showCheck onPress={() => setAgain((a) => !a)} />
              </View>
            </Enter>
          ) : null}
        </Card>
      </Enter>

      {candidates.length ? (
        <Enter>
          <Card tone="primary" style={styles.section}>
            <View style={styles.row}>
              <View style={[styles.well, { backgroundColor: "rgba(255,255,255,0.18)" }]}>
                <Icon name="sparkle" size={20} color={colors.onPrimary} />
              </View>
              <Text variant="heading" color={colors.onPrimary} style={{ flex: 1 }}>
                {t("finish.remember")}
              </Text>
            </View>
            <Text color={colors.onPrimary}>{t("finish.rememberBody")}</Text>
            <View style={styles.chips}>
              {candidates.map((c) => (
                <Chip
                  key={c.about}
                  label={c.statement}
                  selected={remember.includes(c.about)}
                  showCheck
                  onPress={() => setRemember((l) => (l.includes(c.about) ? l.filter((x) => x !== c.about) : [...l, c.about]))}
                />
              ))}
            </View>
          </Card>
        </Enter>
      ) : null}

      {learned.data?.length ? (
        <Enter>
          <Card style={styles.section}>
            <View style={styles.row}>
              <View style={[styles.well, { backgroundColor: colors.primarySoft }]}>
                <Icon name="sparkle" size={20} color={colors.primary} />
              </View>
              <Text variant="heading" style={{ flex: 1 }}>
                {t("finish.noticed")}
              </Text>
            </View>
            <Text muted>{t("finish.noticedBody")}</Text>
            <View style={styles.chips}>
              {learned.data.map((c) => (
                <Chip
                  key={c.key}
                  label={c.statement}
                  selected={!dropped.includes(c.key)}
                  showCheck
                  onPress={() => setDropped((d) => (d.includes(c.key) ? d.filter((x) => x !== c.key) : [...d, c.key]))}
                />
              ))}
            </View>
          </Card>
        </Enter>
      ) : null}

      <Enter index={3}>
        <Card style={styles.section}>
          <View style={styles.row}>
            <View style={[styles.well, { backgroundColor: colors.surfaceMuted }]}>
              <Icon name="pantry" size={20} color={colors.primaryText} />
            </View>
            <Text variant="heading" style={{ flex: 1 }}>
              {t("finish.deduct")}
            </Text>
          </View>
          {offline ? (
            <Text muted>{t("finish.offline")}</Text>
          ) : lines.length === 0 ? (
            <Text muted>{t("finish.deductNone")}</Text>
          ) : (
            <>
              <Text muted>{t("finish.deductBody")}</Text>
              {view.map(({ line: l }, i) => {
                const s = state[l.itemId]!;
                const original = lines[i]!;
                const name = nameOf(l.ingredient);
                return (
                  <View key={l.itemId} style={[styles.line, { backgroundColor: colors.surfaceMuted }]}>
                    <Pressable
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: s.on }}
                      accessibilityLabel={t("finish.used", { name })}
                      onPress={() => patch(l.itemId, { on: !s.on })}
                      hitSlop={8}
                      style={[styles.check, { backgroundColor: s.on ? colors.primary : colors.surface }]}
                    >
                      {s.on ? <Icon name="check" size={18} color={colors.onPrimary} /> : null}
                    </Pressable>
                    <Photo source={ingredientImage(l.ingredient, catalogEntry(l.ingredient)?.category)} size={40} round />
                    <View style={{ flex: 1, gap: 2, opacity: s.on ? 1 : 0.5 }}>
                      <Text variant="bodyStrong">{name}</Text>
                      {!l.staple && changes?.get(l.ingredient) ? (
                        <Text variant="caption" color={colors.primaryText}>
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
            </>
          )}
        </Card>
      </Enter>

      <Enter index={4}>
        <Card style={styles.section}>
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
        </Card>
      </Enter>

      {onShare ? (
        <Enter index={5}>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={t("community.shareFromFinish")}
            onPress={() => onShare(tags.filter((x) => x === "more_garlic").map((x) => t(`finish.tag.${x}` as StringKey)))}
            style={[styles.share, { backgroundColor: colors.peach }]}
          >
            <View style={[styles.well, { backgroundColor: colors.surface }]}>
              <Icon name="users" size={20} color={colors.accentText} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="bodyStrong" color={colors.peachText}>
                {t("community.shareFromFinish")}
              </Text>
              <Text variant="caption" color={colors.peachText}>
                {t("community.shareFromFinishBody")}
              </Text>
            </View>
            <Icon name="forward" size={20} color={colors.peachText} />
          </PressableScale>
        </Enter>
      ) : null}
      {save.isError ? (
        <Text color={colors.alert} accessibilityLiveRegion="polite">
          {t("finish.failed")}
        </Text>
      ) : null}
      <Button
        kind="accent"
        size="cook"
        stretch
        icon="check"
        label={save.isPending ? t("finish.saving") : t("finish.saveHome")}
        disabled={save.isPending}
        onPress={() => save.mutate()}
      />
      <Button kind="quiet" label={t("finish.skip")} disabled={save.isPending} onPress={() => onClose(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  top: { alignItems: "center", gap: space.sm, paddingTop: space.md },
  center: { textAlign: "center" },
  photo: { height: 220, borderRadius: radius.cardLg, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  photoImage: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%" },
  art: { width: 160, height: 160 },
  section: { gap: space.md },
  row: { flexDirection: "row", alignItems: "center", gap: space.md },
  well: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  ratings: { flexDirection: "row", gap: space.sm },
  share: { flexDirection: "row", alignItems: "center", gap: space.md, borderRadius: radius.cardLg, padding: space.lg },
  rating: { flex: 1, alignItems: "center", gap: space.xs, paddingVertical: space.md, borderRadius: radius.item, borderWidth: 1.5 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  line: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 64, padding: space.md, borderRadius: radius.item },
  check: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  amount: { flexDirection: "row", alignItems: "center", gap: space.sm },
  note: { borderRadius: radius.card, padding: space.lg, gap: space.xs },
  qty: { width: 76, textAlign: "center", paddingHorizontal: space.sm },
});
