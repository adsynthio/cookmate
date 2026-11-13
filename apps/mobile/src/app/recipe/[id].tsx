// Recipe detail (KIT-050): what you have and what's missing ("You have 9 of 10", from confident items and
// staples only), substitutes from your own kitchen, Add to list, quantities scaled to who's eating in katori /
// pieces where we know the measure, Why this works (KIT-053), family plates naming who each branch is for (KIT-052)
// and the steps with cues and safety notes.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Image, StyleSheet, View } from "react-native";

import { AppHeader } from "@/components/AppHeader";

import { catalogEntry } from "@/data/catalog";
import { rememberedAmount, useAmountChanges } from "@/components/recipe/amount";
import { BalanceTip } from "@/components/recipe/BalanceTip";
import { MakeItDifferent } from "@/components/recipe/MakeItDifferent";
import { PlanToDinner } from "@/components/recipe/PlanToDinner";
import { SafetyNotes } from "@/components/recipe/SafetyNotes";
import type { AmountChange } from "@/domain/learning";
import { Icon } from "@/design-system/icons";
import { dishImage, ingredientImage } from "@/design-system/media";
import { Enter, PressableScale, SlideIn } from "@/design-system/motion";
import { Badge, Button, Card, IconButton, Photo, Screen, StateView, Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { radius, shadow, space } from "@/design-system/tokens";
import { displayName } from "@/domain/kitchen";
import { CUISINES, LANGUAGE_CODES } from "@/domain/onboarding";
import { CONFIDENT, pantryMatch, type IngredientMatch } from "@/domain/ranking";
import { jobOf, swapBetween } from "@/domain/swaps";
import {
  cueSenses,
  familyBranches,
  localDoc,
  recipeDescription,
  recipeTitle,
  toRankRecipe,
  totalTime,
  whyThisWorks,
  type RecipeDoc,
  type RecipeIngredientDoc,
} from "@/domain/recipes";
import { getLocale, t, useLocale, type StringKey } from "@/i18n";
import { services, type Member } from "@/services";
import { pantryEntries, STAPLES } from "@/services/picks";
import { useSession } from "@/state/session";
import { useStepTimes } from "@/state/stepTimes";
import { useHabits } from "@/state/habits";
import { keepIngredient, usualSkips } from "@/domain/habits";
import { minutesSaved, readyBases, shortcuts } from "@/domain/bases";
import { tiffinFrom } from "@/domain/guests";
import { yourTotalMinutes } from "@/domain/stepTimes";

export default function RecipeScreen() {
  useLocale();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const householdId = useSession((s) => s.householdId);
  const recipe = useQuery({ queryKey: ["recipe", id], queryFn: () => services.recipe.getRecipe(id!), enabled: !!id });
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

  const header = (
    <AppHeader
      title={t("recipe.title")}
      back
      mic={false}
      right={
        recipe.data && householdId ? (
          <>
            <IconButton
              label={t("community.shareRecipe")}
              tone="plain"
              onPress={() =>
                router.push({
                  pathname: "/community/share",
                  params: { recipeId: recipe.data.parent_id ?? recipe.data.id ?? recipe.data.slug, slug: recipe.data.slug, title: recipeTitle(recipe.data, getLocale()) },
                })
              }
            >
              <Icon name="share" />
            </IconButton>
            <SaveHeart householdId={householdId} recipeId={recipe.data.parent_id ?? recipe.data.id ?? recipe.data.slug} />
          </>
        ) : null
      }
    />
  );
  if (recipe.isSuccess) {
    return <RecipeBody header={header} doc={recipe.data} items={kitchen.data ?? []} members={members.data ?? []} householdId={householdId!} />;
  }
  return (
    <Screen header={header} tabBar={false}>
      {recipe.isPending ? (
        <StateView state="loading" title={t("state.loading.home")} />
      ) : (
        <StateView
          state="error"
          title={t("recipe.notFound")}
          body={t("state.error.body")}
          actionLabel={t("state.retry")}
          onAction={() => recipe.refetch()}
        />
      )}
    </Screen>
  );
}

/** KIT-055: save the dish for the household (an adapted version saves the dish it came from). */
function SaveHeart({ householdId, recipeId }: { householdId: string; recipeId: string }) {
  const { colors } = useTheme();
  const memberId = useSession((s) => s.memberId);
  const qc = useQueryClient();
  const favourites = useQuery({ queryKey: ["favourites", householdId], queryFn: () => services.recipe.listFavourites(householdId) });
  const saved = (favourites.data ?? []).some((d) => d.id === recipeId || d.slug === recipeId);
  const toggle = useMutation({
    mutationFn: (on: boolean) => services.recipe.setFavourite({ householdId, memberId: memberId!, recipeId, on }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["favourites", householdId] }),
  });
  if (!memberId || !favourites.data) return null;
  return (
    <IconButton label={saved ? t("recipe.unsave") : t("recipe.save")} tone="plain" onPress={() => !toggle.isPending && toggle.mutate(!saved)}>
      <Icon name="heart" color={saved ? colors.alert : undefined} fill={saved ? colors.alert : undefined} />
    </IconButton>
  );
}

type Tab = "ingredients" | "steps" | "why";

function RecipeBody({
  header,
  doc: rawDoc,
  items,
  members,
  householdId,
}: {
  header: React.ReactNode;
  doc: RecipeDoc;
  items: Parameters<typeof pantryEntries>[0];
  members: Member[];
  householdId: string;
}) {
  const { colors } = useTheme();
  const router = useRouter();
  const locale = getLocale();
  const doc = useMemo(() => localDoc(rawDoc, locale), [rawDoc, locale]);
  const whoEating = useSession((s) => s.whoEating);
  const stepTimes = useStepTimes((s) => s.times);
  // S7: what this cook usually leaves out of this dish, with Add back.
  const habits = useHabits((s) => s.times);
  const setHabits = useHabits((s) => s.set);
  const skips = usualSkips(habits, doc.slug);
  const eaters = whoEating ? members.filter((m) => whoEating.includes(m.id)) : members;
  const [servings, setServings] = useState(Math.max(1, eaters.length || doc.base_servings));
  const [listed, setListed] = useState<string[]>([]);
  const [tab, setTab] = useState<Tab>("ingredients");
  const [tabDir, setTabDir] = useState<1 | -1 | 0>(0);
  const TABS: Tab[] = ["ingredients", "steps", "why"];
  const pickTab = (next: Tab) => {
    setTabDir(TABS.indexOf(next) > TABS.indexOf(tab) ? 1 : -1);
    setTab(next);
  };

  // What was said about this dish last time (KIT-104): shown before cooking, so it is acted on.
  const memories = useQuery({ queryKey: ["memories", householdId], queryFn: () => services.preference.listMemories(householdId) });
  // Plain dislikes (and allergies) are never used as a swap.
  const avoid = useMemo(
    () => (memories.data ?? []).filter((m) => m.ingredientKey && m.recipeId === null && m.polarity < 0).map((m) => m.ingredientKey!),
    [memories.data],
  );
  const entries = useMemo(() => pantryEntries(items), [items]);
  // S9: a ready Sunday batch (masala, boiled chana, ginger-garlic paste) and the steps it replaces.
  const baseCuts = useMemo(() => shortcuts(doc, readyBases(items)), [doc, items]);
  const match = useMemo(() => pantryMatch(toRankRecipe(doc), entries, STAPLES, avoid), [doc, entries, avoid]);
  const inKitchen = useMemo(
    () => new Set([...entries.filter((e) => !e.out && e.confidence >= CONFIDENT).map((e) => e.key), ...STAPLES]),
    [entries],
  );
  const byKey = new Map(match.items.map((m) => [m.key, m]));
  const missing = match.items.filter((m) => m.status === "missing" && !listed.includes(m.key) && !skips.includes(m.key));
  const nameOf = (key: string) => displayName(catalogEntry(key), key, locale);

  const addToList = useMutation({
    mutationFn: (keys: string[]) => services.kitchen.addToList(householdId, keys.map((k) => ({ name: k, reason: "manual" as const }))),
    onSuccess: (_, keys) => setListed((l) => [...l, ...keys]),
  });
  const dishIds = [doc.id, doc.parent_id, doc.slug].filter(Boolean);
  const remembered = (memories.data ?? []).filter((m) => m.recipeId !== null && dishIds.includes(m.recipeId));
  const changes = useAmountChanges(householdId, doc);

  // Opened from a pick on Home: the session remembers which suggestion it came from.
  const { rec } = useLocalSearchParams<{ rec?: string }>();
  const start = useMutation({
    mutationFn: () =>
      services.cooking.startSession({
        householdId,
        recipeId: doc.id ?? doc.slug,
        servings,
        whoEating: eaters.map((e) => e.id),
        recommendationId: rec || undefined,
        languageCode: LANGUAGE_CODES[locale],
      }),
    onSuccess: (sessionId) => router.push(`/cook/${sessionId}`),
  });

  const title = recipeTitle(doc, locale);
  const photo = dishImage(doc.slug);
  const why = whyThisWorks(doc.flavor_profile, locale);
  const branches = familyBranches(doc, eaters.map((e) => ({ name: e.displayName, ageGroup: e.ageGroup })));
  const notes = eaters.filter((e) => e.notes);
  const time = totalTime(doc);
  // S2: once this cook's own pace is known, the time is theirs.
  const yours = yourTotalMinutes(stepTimes, doc.slug, doc.steps, time);

  const share = match.total ? Math.round((match.have / match.total) * 100) : 0;
  const subs = match.items.filter((m) => m.status === "substitute" && m.substitute);
  // Recipes say "generic_north" for everyday North Indian food.
  const region = doc.cuisine_region === "generic_north" ? "north_indian" : doc.cuisine_region;
  const cuisine = region && (CUISINES as readonly string[]).includes(region) ? region : null;
  const level = doc.difficulty <= 2 ? "easy" : doc.difficulty === 3 ? "medium" : "hard";

  return (
    <Screen
      header={header}
      tabBar={false}
      footer={
        <View style={[styles.footer, shadow.float, { backgroundColor: colors.surface }]}>
          <IconButton label={t("recipe.adapt")} onPress={() => router.push(`/adapt/${doc.id ?? doc.slug}`)}>
            <Icon name="edit" />
          </IconButton>
          <View style={{ flex: 1 }}>
            <Button
              kind="accent"
              size="cook"
              stretch
              icon="cook"
              label={start.isPending ? t("cook.starting") : t("recipe.cookWithMe")}
              disabled={start.isPending}
              onPress={() => start.mutate()}
            />
          </View>
        </View>
      }
    >
      <Enter>
        <View style={[styles.hero, { backgroundColor: colors.primaryPale }]}>
          {photo ? <Image source={photo} style={styles.heroImage} resizeMode="cover" accessibilityLabel={title} /> : null}
          {doc.tags?.includes("new_creation") || doc.review_status !== "approved" ? (
            <View style={styles.heroTop}>
              <View style={styles.tag}>
                <Icon name={doc.tags?.includes("new_creation") ? "sparkle" : "bulb"} size={14} color="#FFFFFF" />
                <Text variant="caption" weight={600} color="#FFFFFF">
                  {doc.tags?.includes("new_creation") ? t("invent.badge") : t("recipe.draftShort")}
                </Text>
              </View>
            </View>
          ) : null}
          <View style={styles.heroBottom}>
            <View style={styles.tag}>
              <Icon name="sparkle" size={14} color="#FFFFFF" />
              <Text variant="caption" weight={600} color="#FFFFFF">
                {t("recipe.match", { n: share })}
              </Text>
            </View>
          </View>
        </View>
      </Enter>

      <Enter index={1} style={{ gap: space.sm }}>
        {cuisine ? (
          <View style={{ alignSelf: "flex-start" }}>
            <Badge tone="primary" label={t(`cuisine.${cuisine}` as StringKey)} />
          </View>
        ) : null}
        <Text variant="display" accessibilityRole="header">
          {title}
        </Text>
        {doc.parent_id ? null : <Text muted>{recipeDescription(doc, locale)}</Text>}
      </Enter>

      {/* G6: allergens on every recipe; on an AI recipe, a plain label and "Something's off". */}
      <SafetyNotes doc={doc} householdId={householdId} onReported={() => router.back()} />

      <Enter index={2}>
        <View style={[styles.stats, { backgroundColor: colors.surfaceMuted }]}>
          <Stat
            icon="timer"
            value={yours ? t("home.minutes", { min: yours }) : time ? t("home.minutes", { min: time }) : "–"}
            label={yours ? t("recipe.yourTime") : t("recipe.totalTime")}
          />
          <Stat icon="skillet" value={t(`recipe.level.${level}` as StringKey)} label={t("recipe.difficulty")} highlight />
          <Stat icon="chilli" value={`${doc.spice_level}/5`} label={t("recipe.spiceLabel")} />
        </View>
      </Enter>

      {/* The olive card: can I cook this now, and what Cookmate changed for this kitchen. */}
      <Enter index={3}>
        <Card tone="primary" style={{ gap: space.md }}>
          <View style={styles.cardHead}>
            <View style={[styles.well, { backgroundColor: "rgba(255,255,255,0.18)" }]}>
              <Icon name="sparkle" size={18} color={colors.onPrimary} />
            </View>
            <Text variant="overline" color={colors.onPrimary} style={{ flex: 1 }}>
              {(doc.parent_id ? t("adapt.yourVersion") : t("recipe.forYourKitchen")).toUpperCase()}
            </Text>
          </View>
          <Text variant="subheading" color={colors.onPrimary}>
            {match.have === match.total ? t("recipe.haveAll") : t("recipe.haveOf", { have: match.have, total: match.total })}
          </Text>
          {doc.parent_id ? <Text color={colors.onPrimary}>{doc.description}</Text> : null}
          {subs.map((m) => (
            <Text key={m.key} color={colors.onPrimary}>
              {t("recipe.subLine", { item: nameOf(m.substitute!), instead: nameOf(m.key) })}
              {swapBetween(m.key, m.substitute!) ? ` ${t(`swaps.taste.${swapBetween(m.key, m.substitute!)!.taste}`)}.` : ""}
              {/* M1: the job the swap keeps ("Same job: makes it rise"). */}
              {swapBetween(m.key, m.substitute!) && jobOf(swapBetween(m.key, m.substitute!)!)
                ? ` ${t("swaps.sameJob", { job: t(`job.${jobOf(swapBetween(m.key, m.substitute!)!)}` as StringKey) })}`
                : ""}
            </Text>
          ))}
          <View style={[styles.track, { backgroundColor: "rgba(255,255,255,0.25)" }]} accessible={false}>
            <View style={[styles.fill, { backgroundColor: colors.peach, width: `${share}%` }]} />
          </View>
          {missing.length > 0 ? (
            <Button
              kind="light"
              icon="cart"
              label={missing.length === 1 ? t("recipe.addOne") : t("recipe.addMissing", { n: missing.length })}
              disabled={addToList.isPending}
              onPress={() => addToList.mutate(missing.map((m) => m.key))}
            />
          ) : null}
        </Card>
      </Enter>

      {baseCuts.length ? (
        <Card tint={colors.primaryPale} style={{ gap: space.xs }}>
          <Text variant="subheading">{t("bases.title", { min: minutesSaved(baseCuts) >= 120 ? t("bases.overnight") : t("home.minutes", { min: minutesSaved(baseCuts) }) })}</Text>
          {baseCuts.map((c) => (
            <Text key={c.base}>
              {t(`bases.line.${c.base}`, { steps: c.steps.join(", "), pulse: c.pulse ? nameOf(c.pulse) : "" })}
            </Text>
          ))}
        </Card>
      ) : null}

      <MakeItDifferent doc={doc} has={(k) => inKitchen.has(k)} avoid={avoid} nameOf={nameOf} />

      {householdId ? <PlanToDinner doc={doc} householdId={householdId} servings={servings} /> : null}

      {/* S10: a little extra tonight is tomorrow's tiffin. */}
      {(() => {
        const tiffin = tiffinFrom(doc.parent_id ? doc.slug.replace(/-v\d+$/, "") : doc.slug, 1);
        if (!tiffin) return null;
        return (
          <Card style={{ gap: space.xs }}>
            <Text variant="subheading">{t("tiffin.title")}</Text>
            <Text>{t(`tiffin.idea.${tiffin.idea}`)}</Text>
            <Text variant="caption" muted>
              {t("tiffin.fridge")}
            </Text>
            <View style={{ alignSelf: "flex-start" }}>
              <Button kind="secondary" size="small" icon="plus" label={t("tiffin.cookExtra", { n: servings + 1 })} onPress={() => setServings((s) => Math.min(20, s + 1))} />
            </View>
          </Card>
        );
      })()}

      <BalanceTip slug={doc.slug} groups={doc.food_groups} course={doc.course} diet={doc.diet} />

      {remembered.length ? (
        <Card tint={colors.peach}>
          <Text variant="label" muted>
            {t("recipe.remembered")}
          </Text>
          {remembered.map((m) => (
            <Text key={m.id} variant="bodyStrong">
              {m.statement}
            </Text>
          ))}
        </Card>
      ) : null}
      {start.isError ? (
        <Text color={colors.alert} accessibilityLiveRegion="polite">
          {t("state.error.body")}
        </Text>
      ) : null}

      <View style={[styles.tabs, { backgroundColor: colors.surfaceMuted }]} accessibilityRole="tablist">
        {TABS.map((k) => {
          const on = tab === k;
          const label = k === "ingredients" ? t("recipe.tab.ingredients", { n: doc.ingredients.length }) : k === "steps" ? t("recipe.tab.steps", { n: doc.steps.length }) : t("recipe.tab.why");
          return (
            <PressableScale
              key={k}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={label}
              onPress={() => pickTab(k)}
              style={[styles.tab, on ? [shadow.card, { backgroundColor: colors.surface }] : null]}
            >
              <Text variant="label" weight={on ? 600 : 500} color={on ? colors.ink : colors.inkSecondary} numberOfLines={1}>
                {label}
              </Text>
            </PressableScale>
          );
        })}
      </View>

      <SlideIn key={tab} from={tabDir} style={{ gap: space.md }}>
        {tab === "ingredients" ? (
          <>
            <View style={styles.servings}>
              <IconButton label={t("recipe.fewer")} onPress={() => setServings((s) => Math.max(1, s - 1))}>
                <Icon name="minus" />
              </IconButton>
              <Text variant="bodyStrong" style={{ flex: 1, textAlign: "center" }} accessibilityLiveRegion="polite">
                {servings === 1 ? t("recipe.cookingForOne") : t("recipe.cookingFor", { n: servings })}
              </Text>
              <IconButton label={t("recipe.oneMore")} onPress={() => setServings((s) => Math.min(20, s + 1))}>
                <Icon name="plus" />
              </IconButton>
            </View>
            {doc.ingredients.map((ing, i) => (
              <IngredientRow
                key={`${ing.ingredient}-${i}`}
                ing={ing}
                match={byKey.get(ing.ingredient)}
                servings={servings}
                base={doc.base_servings}
                nameOf={nameOf}
                listed={listed.includes(ing.ingredient)}
                onAdd={() => addToList.mutate([ing.ingredient])}
                change={changes.get(ing.ingredient)}
                skipped={skips.includes(ing.ingredient)}
                onKeep={() => setHabits(keepIngredient(useHabits.getState().times, doc.slug, ing.ingredient))}
              />
            ))}
          </>
        ) : tab === "steps" ? (
          doc.steps.map((s, i) => {
            const branch = branches.find((b) => b.step === i + 1);
            const mins = s.minutes ?? (s.seconds ? Math.max(1, Math.round(s.seconds / 60)) : null);
            const senses = cueSenses(s);
            return (
              <Card key={i} style={{ gap: space.sm }}>
                <View style={styles.stepHead}>
                  <View style={[styles.stepNo, { backgroundColor: colors.primary }]}>
                    <Text variant="label" weight={600} color={colors.onPrimary}>
                      {i + 1}
                    </Text>
                  </View>
                  <Text variant="caption" muted style={{ flex: 1 }}>
                    {[
                      mins ? (mins >= 90 ? t("recipe.stepHours", { h: Math.round(mins / 60) }) : t("recipe.stepTime", { min: mins })) : null,
                      s.whistles ? t("recipe.whistles", { n: s.whistles }) : null,
                      s.heat ? t(`cook.heat.${s.heat}` as StringKey) : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                </View>
                <Text variant="bodyStrong">{s.text}</Text>
                {senses.length ? (
                  senses.slice(0, 2).map(({ sense, text }) => (
                    <View key={sense} style={styles.cueLine}>
                      <Icon name={SENSE_ICON[sense]} size={16} color={colors.primaryText} />
                      <Text variant="label" color={colors.inkSecondary} style={{ flex: 1 }}>
                        {text}
                      </Text>
                    </View>
                  ))
                ) : s.cue ? (
                  <Text variant="label" muted>
                    {t("recipe.cue")}: {s.cue}
                  </Text>
                ) : null}
                {s.cues?.avoid ? (
                  <View style={styles.cueLine}>
                    <Icon name="warning" size={16} color={colors.accentText} />
                    <Text variant="label" color={colors.accentText} style={{ flex: 1 }}>
                      {s.cues.avoid}
                    </Text>
                  </View>
                ) : null}
                {branch ? (
                  <View style={[styles.note, { backgroundColor: colors.primaryPale }]}>
                    <Text variant="label">
                      {branch.members.join(", ")}: {branch.action}
                    </Text>
                  </View>
                ) : null}
                {s.safety ? (
                  <View style={[styles.note, { backgroundColor: colors.alertSoft }]} accessibilityRole="alert">
                    <Text variant="label" color={colors.alert} weight={500}>
                      {t("recipe.safety")}: {s.safety}
                    </Text>
                  </View>
                ) : null}
              </Card>
            );
          })
        ) : (
          <>
            {why ? (
              <Card style={{ gap: space.md }}>
                <Text variant="subheading">{t("recipe.why")}</Text>
                {why.bars.map((b) => (
                  <View key={b.key} style={styles.barRow} accessible accessibilityLabel={`${t(`recipe.flavor.${b.key}` as StringKey)} ${Math.round(b.value * 10)}/10`}>
                    <Text variant="label" style={styles.barLabel}>
                      {t(`recipe.flavor.${b.key}` as StringKey)}
                    </Text>
                    <View style={[styles.track, { flex: 1, backgroundColor: colors.surfaceMuted }]}>
                      <View style={[styles.fill, { backgroundColor: colors.primary, width: `${b.value * 100}%` }]} />
                    </View>
                  </View>
                ))}
                <Text>{why.sentence}</Text>
              </Card>
            ) : null}
            {branches.length || notes.length ? (
              <Card style={{ gap: space.md }}>
                <Text variant="subheading">{t("recipe.family")}</Text>
                {branches.map((b) => (
                  <View key={`${b.step}-${b.ageGroup}`} style={{ gap: 2 }}>
                    <Text variant="bodyStrong">
                      {b.members.join(", ")} · {t("recipe.familyStep", { n: b.step })}
                    </Text>
                    <Text>{b.action}</Text>
                  </View>
                ))}
                {notes.map((m) => (
                  <Text key={m.id} muted>
                    {t("recipe.note", { name: m.displayName, note: m.notes! })}
                  </Text>
                ))}
              </Card>
            ) : null}
            {!why && !branches.length && !notes.length ? <Text muted>{t("recipe.whyNone")}</Text> : null}
          </>
        )}
      </SlideIn>
    </Screen>
  );
}

const SENSE_ICON = { look: "eye", sound: "ear", smell: "nose", touch: "hand", taste: "spoon" } as const;

function Stat({ icon, value, label, highlight }: { icon: "timer" | "skillet" | "chilli"; value: string; label: string; highlight?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.stat, highlight ? { backgroundColor: colors.surfaceHigh } : null]} accessible accessibilityLabel={`${label}: ${value}`}>
      <View style={styles.statTop}>
        <Icon name={icon} size={18} color={colors.ink} />
        <Text variant="bodyStrong">{value}</Text>
      </View>
      <Text variant="caption" muted>
        {label}
      </Text>
    </View>
  );
}

function IngredientRow({
  ing,
  match,
  servings,
  base,
  nameOf,
  listed,
  onAdd,
  change,
  skipped,
  onKeep,
}: {
  change?: AmountChange;
  skipped?: boolean;
  onKeep?: () => void;
  ing: RecipeIngredientDoc;
  match: IngredientMatch | undefined;
  servings: number;
  base: number;
  nameOf: (key: string) => string;
  listed: boolean;
  onAdd: () => void;
}) {
  const { colors } = useTheme();
  const { label: amount, note: changeNote } = rememberedAmount(ing, base, servings, change);
  const status = ing.optional ? "optional" : (match?.status ?? "missing");
  const detail = skipped
    ? t("recipe.usuallySkip")
    : status === "have"
      ? t("recipe.have")
      : status === "assumed"
        ? t("recipe.assumed")
        : status === "substitute" && match?.substitute
          ? t("recipe.useInstead", { item: nameOf(match.substitute) })
          : status === "optional"
            ? t("recipe.optional")
            : match?.substitute
              ? `${t("recipe.missing")} · ${t("recipe.orUse", { item: nameOf(match.substitute) })}`
              : t("recipe.missing");
  const icon = status === "have" || status === "assumed" ? "check" : status === "substitute" ? "undo" : status === "missing" ? "plus" : null;
  const ok = status === "have" || status === "assumed";
  // Only the ingredient's own photo: a category stand-in on every row would read as clutter.
  const photo = ingredientImage(ing.ingredient);
  return (
    <View
      style={[styles.ingRow, shadow.card, { backgroundColor: colors.surface }]}
      accessible
      accessibilityLabel={[nameOf(ing.ingredient), amount, changeNote, detail].filter(Boolean).join(", ")}
    >
      <View style={[styles.ingIcon, { backgroundColor: ok ? colors.primary : status === "substitute" ? colors.accent : status === "missing" ? colors.peach : colors.surfaceMuted }]}>
        {icon ? <Icon name={icon} size={16} color={ok ? colors.onPrimary : status === "substitute" ? colors.onAccent : colors.accentText} /> : null}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong" style={skipped ? { textDecorationLine: "line-through", opacity: 0.6 } : undefined}>
          {nameOf(ing.ingredient)}
        </Text>
        <Text variant="caption" color={status === "missing" && !skipped ? colors.accentText : colors.inkSecondary}>
          {detail}
        </Text>
        {skipped && onKeep ? (
          <View style={{ alignSelf: "flex-start" }}>
            <Button kind="quiet" size="small" label={t("recipe.addBack")} onPress={onKeep} />
          </View>
        ) : null}
      </View>
      {photo ? <Photo source={photo} size={40} round /> : null}
      <View style={styles.amount}>
        <Text variant="label" muted style={{ textAlign: "right" }}>
          {amount}
        </Text>
        {changeNote ? (
          <Text variant="caption" color={colors.primaryText} style={{ textAlign: "right" }}>
            {changeNote}
          </Text>
        ) : null}
        {status === "missing" ? (
          listed ? (
            <Text variant="caption" color={colors.primaryText}>
              {t("recipe.added")}
            </Text>
          ) : (
            <IconButton label={`${t("recipe.addOne")}: ${nameOf(ing.ingredient)}`} muted onPress={onAdd}>
              <Icon name="cart" size={20} />
            </IconButton>
          )
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { height: 300, borderRadius: radius.cardLg, overflow: "hidden" },
  heroImage: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%" },
  heroTop: { position: "absolute", top: space.md, left: space.md },
  heroBottom: { position: "absolute", bottom: space.md, left: space.md },
  tag: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 6, backgroundColor: "rgba(28,28,24,0.62)" },
  stats: { flexDirection: "row", borderRadius: radius.card, padding: space.xs },
  stat: { flex: 1, alignItems: "center", gap: 2, paddingVertical: space.sm, borderRadius: radius.item },
  statTop: { flexDirection: "row", alignItems: "center", gap: 6 },
  cardHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  well: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  track: { height: 8, borderRadius: radius.pill, overflow: "hidden" },
  fill: { height: 8, borderRadius: radius.pill },
  tabs: { flexDirection: "row", borderRadius: radius.pill, padding: 4, gap: 4 },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 44, borderRadius: radius.pill, paddingHorizontal: space.sm },
  servings: { flexDirection: "row", alignItems: "center", gap: space.md },
  ingRow: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 64, borderRadius: radius.item, paddingHorizontal: space.md, paddingVertical: space.sm },
  amount: { alignItems: "flex-end", gap: space.xs, maxWidth: 120 },
  ingIcon: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  barRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  barLabel: { width: 80 },
  stepHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  stepNo: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  cueLine: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  note: { borderRadius: radius.tag, padding: space.md },
  footer: { flexDirection: "row", alignItems: "center", gap: space.md, marginHorizontal: space.gutter, marginBottom: space.md, borderRadius: radius.pill, padding: space.sm },
});
