// Home: "Tonight, decided" (HOME-01/02, KIT-040), craving chips and free text (HOME-03, KIT-042), Use Soon strip
// that opens waste-aware picks (HOME-04, KIT-043), meal slot switch (HOME-05, KIT-046), who's eating today
// (HH-03, KIT-057), and every screen state (HOME-08). Sprint 6: one "Still have X?" a day when the answer changes
// the pick (KIT-035), today's festivals and "keeping the fast?" (KIT-144), the daily pick notification's batch opens
// instantly (KIT-045), and "make something new" (KIT-056).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { WantDish } from "@/components/home/WantDish";
import { HomeHero } from "@/components/home/HomeHero";
import { ReadyCard } from "@/components/home/ReadyCard";
import { localDate, PlanCard } from "@/components/home/PlanCard";
import { DinnerCard } from "@/components/home/DinnerCard";
import { PicksSkeleton } from "@/components/home/PicksSkeleton";
import { InSeason } from "@/components/home/InSeason";
import { WeekCard } from "@/components/you/WeekCard";
import { InventCard, NewDishCard, PickCard, pickPhoto, ResumeCard, UseSoonCards } from "@/components/home/HomeParts";

import { itemName } from "@/components/kitchen/names";
import { dishImage, illustrations } from "@/design-system/media";
import { Enter } from "@/design-system/motion";
import { Button, Card, Chip, Screen, SectionHeader, StateView, Text, type Scroller } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { radius, space } from "@/design-system/tokens";
import { eventEmoji } from "@/domain/calendar";
import { LANGUAGE_CODES } from "@/domain/onboarding";
import { recipeTitle } from "@/domain/recipes";
import { getLocale, t, useLocale, type StringKey } from "@/i18n";
import { services, type CalendarToday, type EventNames, type MealSlot, type PantryItem, type PantryQuestion, type Pick, type PickBatch } from "@/services";
import { usePlan } from "@/state/plan";
import { ideasLead } from "@/domain/seen";
import { rememberShown, seenLately } from "@/state/seen";
import { useSession } from "@/state/session";
import { useSettled } from "@/state/settled";

const DISMISS_REASONS = ["not_today", "dont_like", "no_time", "missing_item"] as const;
type DismissReason = (typeof DISMISS_REASONS)[number];

const CHIPS: { key: string; label: StringKey }[] = [
  { key: "comforting", label: "chip.comforting" },
  { key: "under_20", label: "chip.under20" },
  { key: "high_protein", label: "chip.highProtein" },
  { key: "kids_friendly", label: "chip.kidsFriendly" },
  { key: "light", label: "chip.light" },
];
const SLOTS: MealSlot[] = ["breakfast", "lunch", "snack", "dinner"];

export default function HomeScreen() {
  useLocale();
  const router = useRouter();
  const { householdId, memberId, mealSlot, setMealSlot, whoEating, setWhoEating } = useSession();
  const [chips, setChips] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [craving, setCraving] = useState("");
  const [focus, setFocus] = useState<PantryItem | null>(null);
  const [pickingSlot, setPickingSlot] = useState(false);
  // KIT-045: tapping the daily pick notification opens its precomputed batch, until the cook changes anything.
  const { batch, use } = useLocalSearchParams<{ batch?: string; use?: string }>();
  const queryClient = useQueryClient();
  // Kitchen's "Find dishes for these" and the pan button on a row open Home focused on that item.
  useEffect(() => {
    if (!use || !householdId) return;
    const all = queryClient.getQueryData<PantryItem[]>(["kitchen", householdId]) ?? [];
    const item = all.find((i) => i.id === use);
    if (item) setFocus(item);
    router.setParams({ use: undefined });
  }, [use, householdId, queryClient, router]);
  const notified = batch && !chips.length && !craving && !focus && whoEating === null && mealSlot === "dinner" ? batch : null;
  const [checkDone, setCheckDone] = useState(false);
  const [fastDeclined, setFastDeclined] = useState<string | null>(null);

  const members = useQuery({
    queryKey: ["members", householdId],
    queryFn: () => services.preference.listMembers(householdId!),
    enabled: !!householdId,
  });
  // Each request for picks is an AI call (credits): ask once the filters settle, keep the answer for half an hour,
  // and refresh when Home is opened after something changed rather than in the background.
  // Compared as text: a new object every render would never settle.
  const askKey = useSettled(JSON.stringify({ mealSlot, chips, craving, whoEating, focusKey: focus?.ingredientKey ?? null }));
  const ask = useMemo(
    () => JSON.parse(askKey) as { mealSlot: MealSlot; chips: string[]; craving: string; whoEating: typeof whoEating; focusKey: string | null },
    [askKey],
  );
  // A dish planned for today whose soaking or marinating is done can be cooked now (Rajma after its overnight soak).
  const plan = usePlan((s) => s.plan);
  const prepped = plan?.prepDone && plan.forDate === localDate(new Date()) && (!plan.readyAt || Date.now() >= plan.readyAt) ? [plan.recipeId] : [];
  const picksKey = ["picks", householdId, ask.mealSlot, ask.chips, ask.craving, ask.whoEating, ask.focusKey, getLocale(), notified, prepped.join()];
  const picks = useQuery({
    queryKey: picksKey,
    queryFn: async () => {
      // What Home showed lately, so the picks and ideas change each time (read when the request is made).
      const l = seenLately();
      const batch =
        (notified ? await services.recipe.getBatch(householdId!, notified).catch(() => null) : null) ??
        (await services.recipe.getPicks({
          householdId: householdId!,
          memberId: memberId!,
          mealSlot: ask.mealSlot,
          chips: ask.chips,
          craving: ask.craving || undefined,
          whoEating: ask.whoEating ?? undefined,
          focus: ask.focusKey ? [ask.focusKey] : undefined,
          languageCode: LANGUAGE_CODES[getLocale()],
          prepped,
          shownLately: l.recipes,
          ideasLately: l.ideas,
        }));
      const ideaCount = batch.ideas?.length ? batch.ideas.length : batch.newDish ? 1 : 0;
      return { ...batch, ideasFirst: ideasLead(batch.hero?.recipeId, ideaCount, l.recipes) };
    },
    enabled: !!householdId && !!memberId,
    staleTime: 30 * 60_000,
    gcTime: 60 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  // "Not this one": the next dish takes its place at once (the AI's fresh picks can take seconds), and the dismissal
  // is saved behind it; if saving fails, the dish comes back with a message. Fresh picks are asked for only when
  // nothing is left to show.
  const dismiss = useMutation({
    mutationFn: ({ pick, reason }: { pick: Pick; reason: DismissReason }) => services.recipe.respondToPick(pick.recommendationId, "dismissed", reason),
    onMutate: async ({ pick, reason }) => {
      setAsking(false);
      setRememberedNote(false);
      setDisliked(reason === "dont_like" ? pick : null);
      await queryClient.cancelQueries({ queryKey: picksKey });
      const before = queryClient.getQueryData<PickBatch>(picksKey);
      if (before) {
        const rest = [before.hero, ...before.alternates].filter((p): p is Pick => !!p && p.recipeId !== pick.recipeId);
        queryClient.setQueryData<PickBatch>(picksKey, { ...before, hero: rest[0] ?? null, alternates: rest.slice(1) });
      }
      return { before };
    },
    onError: (_err, _vars, context) => {
      if (context?.before) queryClient.setQueryData(picksKey, context.before);
      setDisliked(null);
    },
    onSuccess: () => {
      if (!queryClient.getQueryData<PickBatch>(picksKey)?.hero) void queryClient.invalidateQueries({ queryKey: ["picks"] });
    },
  });
  const { isStale: picksStale, refetch: refetchPicks } = picks;
  // Remember what was shown, so the next picks (after 30 minutes, or "Something different") bring new ones.
  useEffect(() => {
    const d = picks.data;
    if (!d) return;
    rememberShown({
      recipeIds: [d.hero, ...d.alternates].filter((p): p is NonNullable<typeof p> => !!p).map((p) => p.recipeId),
      ideas: (d.ideas ?? []).map((i) => i.name),
    });
  }, [picks.data]);
  const ideas = picks.data?.ideas?.length ? picks.data.ideas : picks.data?.newDish ? [picks.data.newDish] : [];
  const ideasFirst = !!picks.data?.ideasFirst || (!!picks.data && !picks.data.hero);
  useFocusEffect(
    useCallback(() => {
      if (picksStale) void refetchPicks();
    }, [picksStale, refetchPicks]),
  );
  const useSoon = useQuery({
    queryKey: ["useSoon", householdId],
    queryFn: () => services.kitchen.getUseSoon(householdId!),
    enabled: !!householdId,
  });
  const kitchen = useQuery({
    queryKey: ["kitchen", householdId],
    queryFn: () => services.kitchen.getKitchen(householdId!),
    enabled: !!householdId,
  });
  // "Pick up where you left off": a dish this household is in the middle of cooking (KIT-079).
  const active = useQuery({
    queryKey: ["cook-active", householdId],
    queryFn: () => services.cooking.getActiveSession(householdId!),
    enabled: !!householdId,
    staleTime: 0,
  });
  const refetchActive = active.refetch;
  useFocusEffect(
    useCallback(() => {
      void refetchActive();
    }, [refetchActive]),
  );
  const activeRecipe = useQuery({
    queryKey: ["recipe", active.data?.recipeId],
    queryFn: () => services.recipe.getRecipe(active.data!.recipeId),
    enabled: !!active.data,
  });
  const accept = useMutation({ mutationFn: (p: Pick) => services.recipe.respondToPick(p.recommendationId, "accepted") });
  // KIT-044: turn a pick down with a reason; "don't like" offers to remember it, and only saves on a yes.
  const [asking, setAsking] = useState(false);
  const [disliked, setDisliked] = useState<Pick | null>(null);
  const [rememberedNote, setRememberedNote] = useState(false);
  const rememberDislike = useMutation({
    mutationFn: (pick: Pick) =>
      services.preference.saveMemory({
        householdId: householdId!,
        memberId: memberId ?? undefined,
        statement: t("home.dislikeMemory", { dish: recipeTitle(pick, getLocale()) }),
        category: "taste",
        polarity: -1,
        about: "dislike",
        recipeId: pick.recipeId,
      }),
    onSuccess: () => {
      setDisliked(null);
      setRememberedNote(true);
      void queryClient.invalidateQueries({ queryKey: ["memories"] });
    },
  });

  // KIT-035: the answer updates the pantry and the picks.
  const answer = useMutation({
    mutationFn: ({ q, there }: { q: PantryQuestion; there: boolean }) =>
      there ? services.kitchen.updateItem(q.itemId, { confirm: true }) : services.kitchen.finishItem(q.itemId, false),
    onSuccess: () => {
      setCheckDone(true);
      void queryClient.invalidateQueries({ queryKey: ["picks"] });
      void queryClient.invalidateQueries({ queryKey: ["useSoon"] });
      void queryClient.invalidateQueries({ queryKey: ["kitchen"] });
    },
  });
  const keepFast = useMutation({
    mutationFn: (eventId: string) => services.recipe.keepFast(householdId!, eventId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["picks"] }),
  });

  const toggleChip = (key: string) => setChips((c) => (c.includes(key) ? c.filter((x) => x !== key) : [...c, key]));
  const toggleMember = (id: string) => {
    const all = (members.data ?? []).map((m) => m.id);
    const current = whoEating ?? all;
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    setWhoEating(next.length === 0 || next.length === all.length ? null : next);
  };
  const clearFilters = () => {
    setChips([]);
    setCraving("");
    setDraft("");
    setFocus(null);
    setWhoEating(null);
  };
  const open = (p: Pick) => router.push(`/recipe/${p.recipeId}?rec=${encodeURIComponent(p.recommendationId)}`);
  // D5: one tap from the hero pick straight into cooking, for everyone eating (same defaults as the recipe screen).
  const cookNow = useMutation({
    mutationFn: (p: Pick) => {
      const all = (members.data ?? []).map((m) => m.id);
      const eating = whoEating?.length ? whoEating : all;
      return services.cooking.startSession({
        householdId: householdId!,
        recipeId: p.recipeId,
        servings: Math.max(1, eating.length || 2),
        whoEating: eating,
        recommendationId: p.recommendationId,
        languageCode: LANGUAGE_CODES[getLocale()],
      });
    },
    onSuccess: (sessionId) => router.push(`/cook/${sessionId}`),
    // If it can't start (offline, recipe gone), fall back to the recipe page.
    onError: (_e, p) => {
      accept.mutate(p);
      open(p);
    },
  });
  const cook = (p: Pick) => {
    if (!cookNow.isPending) cookNow.mutate(p);
  };
  const me = (members.data ?? []).find((m) => m.id === memberId);
  const hero = picks.data?.hero ?? null;
  const ideasBlock = ideas.length ? (
    <View style={{ gap: space.sm }}>
      <SectionHeader title={t("home.newIdeas.title")} dot={undefined} />
      <Text variant="caption" muted>
        {t("home.newIdeas.body")}
      </Text>
      {ideas.map((d) => (
        <NewDishCard key={d.name} dish={d} overline={false} onPress={() => router.push({ pathname: "/invent", params: { dish: d.name } })} />
      ))}
    </View>
  ) : null;
  const scrollRef = useRef<Scroller>(null);
  const heroH = useRef(0);
  const ideasY = useRef(0);
  const slotLabel = t(`home.slot.${mealSlot}` as StringKey);

  return (
    <Screen
      scrollRef={scrollRef}
      top={
        <View onLayout={(e) => (heroH.current = e.nativeEvent.layout.height)}>
          <HomeHero
            name={me?.displayName}
            slotLabel={slotLabel}
            slot={mealSlot}
            slotOpen={pickingSlot}
            onSlot={() => setPickingSlot((v) => !v)}
            count={kitchen.data?.length ?? 0}
            dish={hero ? pickPhoto(hero) : null}
            draft={draft}
            onDraft={setDraft}
            onSearch={() => setCraving(draft.trim())}
            onPicks={() => scrollRef.current?.scrollTo({ y: Math.max(0, heroH.current + ideasY.current - 8), animated: true })}
          />
        </View>
      }
    >
      {pickingSlot ? (
        <Enter style={styles.row}>
          {SLOTS.map((s) => (
            <Chip
              key={s}
              label={t(`home.slot.${s}` as StringKey)}
              selected={mealSlot === s}
              solid
              onPress={() => {
                setMealSlot(s);
                setPickingSlot(false);
              }}
            />
          ))}
        </Enter>
      ) : null}

      {craving && householdId ? (
        <WantDish
          key={craving}
          query={craving}
          householdId={householdId}
          items={kitchen.data ?? []}
          onOpen={(id) => router.push(`/recipe/${id}`)}
          onInvent={() => router.push("/invent")}
          onMake={(dish) => router.push({ pathname: "/invent", params: { dish } })}
        />
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {(useSoon.data ?? []).slice(0, 2).map((item) => (
          <Chip
            key={item.id}
            icon="leaf"
            label={t("home.useMy", { item: itemName(item) })}
            selected={focus?.id === item.id}
            onPress={() => setFocus(focus?.id === item.id ? null : item)}
          />
        ))}
        {CHIPS.map((c) => (
          <Chip key={c.key} label={t(c.label)} selected={chips.includes(c.key)} onPress={() => toggleChip(c.key)} />
        ))}
      </ScrollView>

      {active.data && activeRecipe.data ? (
        <ResumeCard
          dish={recipeTitle(activeRecipe.data, getLocale())}
          step={Math.min(active.data.currentStep, activeRecipe.data.steps.length)}
          total={activeRecipe.data.steps.length}
          photo={dishImage(activeRecipe.data.slug)}
          onResume={() => router.push(`/cook/${active.data!.id}`)}
        />
      ) : null}

      {members.data && members.data.length > 1 ? (
        <View style={{ gap: space.sm }}>
          <Text variant="label" muted>
            {t("home.whoEating")}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
            {members.data.map((m) => (
              <Chip
                key={m.id}
                initial={(m.displayName.trim()[0] ?? "?").toUpperCase()}
                label={m.displayName}
                selected={whoEating === null || whoEating.includes(m.id)}
                showCheck
                onPress={() => toggleMember(m.id)}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}

      {focus ? (
        <View style={styles.focus}>
          <Text variant="label" style={{ flex: 1 }}>
            {hero && focus.ingredientKey && !hero.uses.includes(focus.ingredientKey)
              ? t("home.focusNone", { item: itemName(focus) })
              : t("home.usingUp", { items: itemName(focus) })}
          </Text>
          <Button kind="quiet" size="small" label={t("home.clear")} onPress={() => setFocus(null)} />
        </View>
      ) : null}

      {picks.data?.calendar ? (
        <CalendarNote
          calendar={picks.data.calendar}
          declined={fastDeclined}
          busy={keepFast.isPending}
          onKeep={(id) => keepFast.mutate(id)}
          onDecline={(id) => setFastDeclined(id)}
        />
      ) : null}

      {picks.data?.check && !checkDone ? (
        <CheckCard question={picks.data.check} busy={answer.isPending} onAnswer={(there) => answer.mutate({ q: picks.data!.check!, there })} />
      ) : checkDone ? (
        <Text variant="label" muted accessibilityLiveRegion="polite">
          {t("home.check.thanks")}
        </Text>
      ) : null}

      {!focus && !craving && !chips.length && mealSlot === "dinner" && householdId && picks.data ? (
        <DinnerCard
          householdId={householdId}
          picks={[picks.data.hero, ...picks.data.alternates].filter((p): p is NonNullable<typeof p> => !!p)}
          onOpen={(id) => router.push(`/recipe/${id}`)}
          onQuick={() => toggleChip("under_20")}
        />
      ) : null}
      {!focus ? <ReadyCard items={kitchen.data ?? []} /> : null}
      {!focus && !craving && picks.data ? (
        <PlanCard
          picks={[...(picks.data.ahead ?? []), ...[picks.data.hero, ...picks.data.alternates].filter((p): p is NonNullable<typeof p> => !!p)]}
          kitchen={kitchen.data ?? []}
          onOpen={(id) => router.push(`/recipe/${id}`)}
        />
      ) : null}

      <View style={{ gap: space.xs }} onLayout={(e) => (ideasY.current = e.nativeEvent.layout.y)}>
        <SectionHeader
          title={t("home.ideas")}
          dot={undefined}
          note={hero || ideas.length ? t("home.ideasCount", { n: (hero ? 1 : 0) + (picks.data?.alternates.length ?? 0) + ideas.length }) : undefined}
        />
        <Text variant="caption" muted>
          {t("home.ideasBody")}
        </Text>
      </View>

      {picks.isPending ? (
        <PicksSkeleton />
      ) : picks.isError ? (
        <StateView
          state="error"
          title={t("state.error.title")}
          body={t("state.error.body")}
          actionLabel={t("state.retry")}
          onAction={() => picks.refetch()}
        />
      ) : !hero && !ideas.length ? (
        <StateView
          state="empty"
          illustration={illustrations.emptyPicks}
          title={t(picks.data.calendar?.today.some((e) => e.kept) ? "home.fast.none.title" : "home.nothingFits.title")}
          body={t(picks.data.calendar?.today.some((e) => e.kept) ? "home.fast.none.body" : "home.nothingFits.body")}
          actionLabel={picks.data.calendar?.today.some((e) => e.kept) ? undefined : t("home.nothingFits.action")}
          onAction={clearFilters}
        />
      ) : (
        <>
          {/* After "Don't like it": the question sits where the cook just tapped, not at the top of Home. */}
          {disliked ? (
            <Enter>
              <Card>
                <Text variant="bodyStrong">{t("home.rememberDislike", { dish: recipeTitle(disliked, getLocale()) })}</Text>
                <View style={styles.reasons}>
                  <Button label={t("home.rememberYes")} kind="secondary" disabled={rememberDislike.isPending} onPress={() => rememberDislike.mutate(disliked)} />
                  <Button label={t("home.rememberNo")} kind="quiet" onPress={() => setDisliked(null)} />
                </View>
                {rememberDislike.isError ? <Text>{t("state.error.body")}</Text> : null}
              </Card>
            </Enter>
          ) : rememberedNote ? (
            <Text variant="label" muted accessibilityLiveRegion="polite">
              {t("home.remembered")}
            </Text>
          ) : null}
          {dismiss.isError ? <Text accessibilityLiveRegion="polite">{t("state.error.body")}</Text> : null}
          {ideasFirst ? ideasBlock : null}
          {/* U4: "Not this one" sits right under the dish it turns down, on the right like a card action. */}
          {hero ? (
            <View style={{ gap: space.xs }}>
              <PickCard pick={hero} hero index={0} onOpen={() => open(hero)} onCook={() => cook(hero)} />
              {asking ? (
                <Enter style={{ gap: space.sm }}>
                  <Text variant="label" muted>
                    {t("home.whyNot")}
                  </Text>
                  <View style={styles.reasons}>
                    {DISMISS_REASONS.map((r) => (
                      <Chip
                        key={r}
                        label={t(`home.reason.${r}` as StringKey)}
                        onPress={() => !dismiss.isPending && dismiss.mutate({ pick: hero, reason: r })}
                      />
                    ))}
                  </View>
                </Enter>
              ) : (
                <View style={{ alignSelf: "flex-end" }}>
                  <Button kind="quiet" size="small" icon="close" label={t("home.notThis")} onPress={() => setAsking(true)} />
                </View>
              )}
            </View>
          ) : null}
          {/* New dishes beyond Cookmate's recipes, from this kitchen, so Home isn't the same three library dishes every
              day: right after the hero, or above it when the hero is a dish Home showed lately (ideasLead). */}
          {!ideasFirst ? ideasBlock : null}
          {picks.data.alternates.map((p, i) => (
            <PickCard key={p.recommendationId} pick={p} index={i + 1} onOpen={() => open(p)} />
          ))}
          <View style={{ alignSelf: "center" }}>
            <Button
              kind="quiet"
              size="small"
              icon="sparkle"
              label={picks.isFetching ? t("home.newIdeas.finding") : t("home.newIdeas.more")}
              disabled={picks.isFetching}
              onPress={() => void refetchPicks()}
            />
          </View>
        </>
      )}

      {/* U15: what's in season this month, after today's picks. */}
      {!focus && !craving ? <InSeason today={new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })} /> : null}

      {useSoon.data && useSoon.data.length > 0 ? (
        <View style={{ gap: space.sm }}>
          <SectionHeader title={t("home.useSoon")} dot={undefined} note={t("home.useSoonCount", { n: useSoon.data.length })} noteTone="accent" />
          <UseSoonCards items={useSoon.data} focused={focus?.id ?? null} onPick={(i) => setFocus(focus?.id === i.id ? null : i)} />
        </View>
      ) : null}

      {/* D3: on Sundays, a look back at the week, after today's picks (U4: deciding comes first). */}
      {!focus && !craving && householdId && new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "Asia/Kolkata" }).format(new Date()) === "Sun" ? (
        <WeekCard householdId={householdId} />
      ) : null}
      <InventCard onPress={() => router.push("/invent")} />
    </Screen>
  );
}

function eventLabel(names: EventNames, name: string): string {
  const l = getLocale();
  return (l === "hi" ? names?.hi : l === "hinglish" ? names?.["hi-Latn"] : names?.en) ?? name;
}

/** KIT-144: "Today: Ekadashi"; a fast the household might keep is offered once, and followed only on a yes. */
function CalendarNote({
  calendar,
  declined,
  busy,
  onKeep,
  onDecline,
}: {
  calendar: CalendarToday;
  declined: string | null;
  busy: boolean;
  onKeep: (id: string) => void;
  onDecline: (id: string) => void;
}) {
  const { colors } = useTheme();
  const kept = calendar.today.find((e) => e.kept);
  const offer = calendar.offerFast;
  // U5: today's festivals and fasts as small pills with their own emoji (🪔 Diwali, 🪁 Sankranti, 🥗 no non-veg day).
  const seen = new Set<string>();
  const today = calendar.today
    .filter((e) => !e.kept)
    .map((e) => ({ label: eventLabel(e.names, e.name), emoji: eventEmoji(e.name, e.kind) }))
    .filter((e) => (seen.has(e.label) ? false : (seen.add(e.label), true)));
  return (
    <View style={{ gap: space.sm }}>
      {today.length ? (
        <View style={styles.todayRow} accessible accessibilityLabel={t("home.calendar.today", { names: today.map((e) => e.label).join(", ") })}>
          <Text variant="label" muted>
            {t("home.calendar.todayLabel")}
          </Text>
          {today.map((e) => (
            <View key={e.label} style={[styles.todayPill, { backgroundColor: colors.peach }]}>
              <Text variant="label" weight={600} color={colors.peachText}>
                {`${e.emoji} ${e.label.charAt(0).toUpperCase()}${e.label.slice(1)}`}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      {kept ? (
        <Text variant="label">{t("home.fast.kept", { name: eventLabel(kept.names, kept.name) })}</Text>
      ) : offer?.id && declined !== offer.id ? (
        <Card>
          <Text variant="bodyStrong">{t("home.fast.title", { name: eventLabel(offer.names, offer.name) })}</Text>
          <View style={styles.reasons}>
            <Button kind="secondary" label={t("home.fast.yes")} disabled={busy} onPress={() => onKeep(offer.id!)} />
            <Button kind="quiet" label={t("home.fast.no")} onPress={() => onDecline(offer.id!)} />
          </View>
        </Card>
      ) : null}
    </View>
  );
}

/** KIT-035: the day's one check question, only asked because the answer changes tonight's pick. */
function CheckCard({ question, busy, onAnswer }: { question: PantryQuestion; busy: boolean; onAnswer: (there: boolean) => void }) {
  return (
    <Card>
      <Text variant="bodyStrong">{t("home.check.title", { item: question.name })}</Text>
      {question.ifYes && question.ifNo ? (
        <Text variant="label" muted>
          {t("home.check.why", { yes: question.ifYes, no: question.ifNo })}
        </Text>
      ) : null}
      <View style={styles.reasons}>
        <Button kind="secondary" label={t("home.check.yes")} disabled={busy} onPress={() => onAnswer(true)} />
        <Button kind="quiet" label={t("home.check.no")} disabled={busy} onPress={() => onAnswer(false)} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  todayRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.sm },
  todayPill: { flexDirection: "row", alignItems: "center", borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 6 },
  reasons: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  row: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, alignItems: "center" },
  chips: { gap: space.sm, paddingVertical: space.xs, paddingRight: space.gutter },
  focus: { flexDirection: "row", alignItems: "center", gap: space.sm },
});
