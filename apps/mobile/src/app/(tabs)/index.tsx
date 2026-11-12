// Home: "Tonight, decided" (HOME-01/02, KIT-040), craving chips and free text (HOME-03, KIT-042), Use Soon strip
// that opens waste-aware picks (HOME-04, KIT-043), meal slot switch (HOME-05, KIT-046), who's eating today
// (HH-03, KIT-057), and every screen state (HOME-08). Sprint 6: one "Still have X?" a day when the answer changes
// the pick (KIT-035), today's festivals and "keeping the fast?" (KIT-144), the daily pick notification's batch opens
// instantly (KIT-045), and "make something new" (KIT-056).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { AppHeader } from "@/components/AppHeader";
import { Greeting, InventCard, PickCard, pickPhoto, ResumeCard, SearchPill, UseSoonCards } from "@/components/home/HomeParts";

import { itemName } from "@/components/kitchen/names";
import { Icon } from "@/design-system/icons";
import { dishImage, illustrations } from "@/design-system/media";
import { Enter } from "@/design-system/motion";
import { Button, Card, Chip, IconButton, Screen, SectionHeader, StateView, Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { space } from "@/design-system/tokens";
import { LANGUAGE_CODES } from "@/domain/onboarding";
import { recipeTitle } from "@/domain/recipes";
import { getLocale, t, useLocale, type StringKey } from "@/i18n";
import { services, type CalendarToday, type EventNames, type MealSlot, type PantryItem, type PantryQuestion, type Pick } from "@/services";
import { useSession } from "@/state/session";

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
  const picks = useQuery({
    queryKey: ["picks", householdId, mealSlot, chips, craving, whoEating, focus?.ingredientKey, getLocale(), notified],
    queryFn: async () =>
      (notified ? await services.recipe.getBatch(householdId!, notified).catch(() => null) : null) ??
      services.recipe.getPicks({
        householdId: householdId!,
        memberId: memberId!,
        mealSlot,
        chips,
        craving: craving || undefined,
        whoEating: whoEating ?? undefined,
        focus: focus?.ingredientKey ? [focus.ingredientKey] : undefined,
        languageCode: LANGUAGE_CODES[getLocale()],
      }),
    enabled: !!householdId && !!memberId,
  });
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
  const dismiss = useMutation({
    mutationFn: ({ pick, reason }: { pick: Pick; reason: DismissReason }) => services.recipe.respondToPick(pick.recommendationId, "dismissed", reason),
    onSuccess: (_, { pick, reason }) => {
      setAsking(false);
      setRememberedNote(false);
      if (reason === "dont_like") setDisliked(pick);
      void queryClient.invalidateQueries({ queryKey: ["picks"] });
    },
  });
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
      void queryClient.invalidateQueries({ queryKey: ["picks"] });
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
  const cook = (p: Pick) => {
    accept.mutate(p);
    open(p);
  };
  const me = (members.data ?? []).find((m) => m.id === memberId);
  const hero = picks.data?.hero ?? null;
  const slotLabel = t(`home.slot.${mealSlot}` as StringKey);

  return (
    <Screen
      header={
        <AppHeader
          title={t("tab.home")}
          right={
            <IconButton label={t("home.search")} tone="plain" onPress={() => router.push("/search")}>
              <Icon name="search" />
            </IconButton>
          }
        />
      }
    >
      <Greeting
        name={me?.displayName}
        slotLabel={slotLabel}
        slotOpen={pickingSlot}
        onSlot={() => setPickingSlot((v) => !v)}
        count={kitchen.data?.length ?? 0}
        photo={hero ? pickPhoto(hero) : null}
      />

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

      <SearchPill value={draft} onChange={setDraft} onSubmit={() => setCraving(draft.trim())} onMic={() => router.push("/voice")} />

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
                icon="you"
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

      {disliked ? (
        <Card>
          <Text variant="bodyStrong">{t("home.rememberDislike", { dish: recipeTitle(disliked, getLocale()) })}</Text>
          <View style={styles.reasons}>
            <Button label={t("home.rememberYes")} kind="secondary" disabled={rememberDislike.isPending} onPress={() => rememberDislike.mutate(disliked)} />
            <Button label={t("home.rememberNo")} kind="quiet" onPress={() => setDisliked(null)} />
          </View>
          {rememberDislike.isError ? <Text>{t("state.error.body")}</Text> : null}
        </Card>
      ) : rememberedNote ? (
        <Text variant="label" muted accessibilityLiveRegion="polite">
          {t("home.remembered")}
        </Text>
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

      <View style={{ gap: space.xs }}>
        <SectionHeader title={t("home.ideas")} dot={undefined} note={hero ? t("home.ideasCount", { n: 1 + (picks.data?.alternates.length ?? 0) }) : undefined} />
        <Text variant="caption" muted>
          {t("home.ideasBody")}
        </Text>
      </View>

      {picks.isPending ? (
        <StateView state="loading" title={t("state.loading.home")} />
      ) : picks.isError ? (
        <StateView
          state="error"
          title={t("state.error.title")}
          body={t("state.error.body")}
          actionLabel={t("state.retry")}
          onAction={() => picks.refetch()}
        />
      ) : !hero ? (
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
              {dismiss.isError ? <Text>{t("state.error.body")}</Text> : null}
            </Enter>
          ) : (
            <View style={{ alignSelf: "flex-start" }}>
              <Button kind="quiet" size="small" icon="close" label={t("home.notThis")} onPress={() => setAsking(true)} />
            </View>
          )}
          {picks.data.alternates.map((p, i) => (
            <PickCard key={p.recommendationId} pick={p} index={i + 1} onOpen={() => open(p)} />
          ))}
        </>
      )}

      {useSoon.data && useSoon.data.length > 0 ? (
        <View style={{ gap: space.sm }}>
          <SectionHeader title={t("home.useSoon")} dot={undefined} note={t("home.useSoonCount", { n: useSoon.data.length })} noteTone="accent" />
          <UseSoonCards items={useSoon.data} focused={focus?.id ?? null} onPick={(i) => setFocus(focus?.id === i.id ? null : i)} />
        </View>
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
  const kept = calendar.today.find((e) => e.kept);
  const offer = calendar.offerFast;
  const names = [...new Set(calendar.today.filter((e) => !e.kept).map((e) => eventLabel(e.names, e.name)))];
  return (
    <View style={{ gap: space.sm }}>
      {names.length ? (
        <Text variant="label" muted>
          {t("home.calendar.today", { names: names.join(", ") })}
        </Text>
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
  reasons: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  row: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, alignItems: "center" },
  chips: { gap: space.sm, paddingVertical: space.xs, paddingRight: space.gutter },
  focus: { flexDirection: "row", alignItems: "center", gap: space.sm },
});
