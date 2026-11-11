// Cook With Me (KIT-070/071/072/078): one big instruction at a time with progress, how to tell it's done, safety
// notes that are never hidden, labelled timers that ring with the app closed, a whistle counter, and big Back / Next
// targets (or a swipe). The screen stays awake. The step shown here is the source of truth while cooking; the
// session row is updated behind it and catches up if a save fails.
// Offline (KIT-076/084): when cooking starts the phone keeps the recipe and downloads this cook's step recordings,
// so with no network the dish can still be finished, read aloud, and driven hands-free; writes wait in the outbox.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Image, PanResponder, ScrollView, StyleSheet, useWindowDimensions, View, type ScrollViewInstance } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { FinishSheet } from "@/components/cook/FinishSheet";
import { TimerChips } from "@/components/cook/TimerChips";
import { useNow } from "@/components/cook/useNow";
import { WhistleCounter } from "@/components/cook/WhistleCounter";
import { rememberedAmount, useAmountChanges } from "@/components/recipe/amount";
import { useHandsFree } from "@/components/cook/useHandsFree";
import { useVoiceProfile } from "@/components/voice/useVoiceProfile";
import type { FastPathMatch } from "@/domain/fastPath";
import type { Pace } from "@/domain/voiceStyle";
import { getBundle, putBundle } from "@/offline/bundles";
import { useOutbox } from "@/offline/outbox";
import { downloadStepAudio, playStepAudio, removeStepAudio } from "@/offline/stepAudio";
import { stepWords } from "@/domain/voiceStyle";
import { catalogEntry } from "@/data/catalog";
import { Icon } from "@/design-system/icons";
import { dishImage } from "@/design-system/media";
import { Button, Card, IconButton, StateView, Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { radius, space } from "@/design-system/tokens";
import { notesForStep } from "@/domain/assist";
import { countWhistle, offersTimer, remaining, stepSeconds } from "@/domain/cooking";
import { displayName } from "@/domain/kitchen";
import { familyBranches, recipeTitle, type RecipeDoc, type RecipeStepDoc } from "@/domain/recipes";
import { leftoverSafety, safetyText } from "@/domain/rescue";
import { getLocale, t, useLocale } from "@/i18n";
import { services, type CookSession, type Member } from "@/services";
import { buzz, hush, say, setSpeechPace, tick } from "@/services/feedback";
import { useSession } from "@/state/session";
import { useTimers } from "@/state/timers";

const KEEP_AWAKE = "cookmate-cook";
/** How long "All 3 whistles" stays up before the next step. */
const WHISTLE_ADVANCE_MS = 1600;
/** Step recordings are made at normal pace; the cook's pace speeds them up or slows them down. Mirrors tts_pace in style.py. */
const RECORDING_RATE: Record<Pace, number> = { slow: 0.85, normal: 1, fast: 1.15 };

export default function CookScreen() {
  useLocale();
  const { colors } = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const householdId = useSession((s) => s.householdId);

  useEffect(() => {
    void activateKeepAwakeAsync(KEEP_AWAKE).catch(() => {});
    return () => {
      void deactivateKeepAwake(KEEP_AWAKE).catch(() => {});
      hush();
    };
  }, []);

  const session = useQuery({ queryKey: ["cook", id], queryFn: () => services.cooking.getSession(id!), enabled: !!id, staleTime: 0 });
  const recipeId = session.data?.recipeId;
  const recipe = useQuery({ queryKey: ["recipe", recipeId], queryFn: () => services.recipe.getRecipe(recipeId!), enabled: !!recipeId });
  const members = useQuery({
    queryKey: ["members", householdId],
    queryFn: () => services.preference.listMembers(householdId!),
    enabled: !!householdId,
  });

  const home = () => router.replace("/");
  const body =
    // Wait for this visit's own read: a copy cached from an earlier visit may be steps behind.
    session.isPending || !session.isFetchedAfterMount || (session.isSuccess && recipe.isPending) ? (
      <StateView state="loading" title={t("cook.title")} />
    ) : session.isError || recipe.isError || !recipe.data ? (
      <StateView
        state="error"
        title={t("cook.notFound")}
        body={t("state.error.body")}
        actionLabel={t("state.retry")}
        onAction={() => void (session.isError ? session.refetch() : recipe.refetch())}
      />
    ) : session.data.status !== "active" && session.data.status !== "paused" ? (
      <StateView state="empty" title={t("cook.notFound")} actionLabel={t("cook.goHome")} onAction={home} />
    ) : (
      <Cooking session={session.data} doc={recipe.data} members={members.data ?? []} householdId={householdId!} />
    );

  const framed = session.isSuccess && session.isFetchedAfterMount && recipe.isSuccess && (session.data.status === "active" || session.data.status === "paused");
  return (
    <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: colors.canvas }}>
      {framed ? (
        body
      ) : (
        <View style={styles.plain}>
          <View style={{ flexDirection: "row" }}>
            <IconButton label={t("cook.leave")} onPress={() => (router.canGoBack() ? router.back() : home())}>
              <Icon name="close" />
            </IconButton>
          </View>
          {body}
        </View>
      )}
    </SafeAreaView>
  );
}

function durationLabel(sec: number): string {
  if (sec < 60) return t("cook.dur.sec", { n: sec });
  const min = Math.round(sec / 60);
  if (min < 60) return t("cook.dur.min", { n: min });
  const rest = min % 60;
  const hours = t("cook.dur.hr", { n: Math.floor(min / 60) });
  return rest ? `${hours} ${t("cook.dur.min", { n: rest })}` : hours;
}

function Cooking({ session, doc, members, householdId }: { session: CookSession; doc: RecipeDoc; members: Member[]; householdId: string }) {
  // Remembered "more garlic" and the like (KIT-104), shown in the ingredient list.
  const changes = useAmountChanges(householdId, doc);
  const voice = useVoiceProfile();
  const { colors } = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const locale = getLocale();
  const { width: screenWidth } = useWindowDimensions();
  const memberId = useSession((s) => s.memberId);
  const total = doc.steps.length;
  const dish = recipeTitle(doc, locale);

  const [stepNo, setStepNo] = useState(() => Math.max(1, Math.min(total, session.currentStep)));
  const [whistles, setWhistles] = useState<Record<number, number>>({});
  const [showIngredients, setShowIngredients] = useState(false);
  const [reading, setReading] = useState(false);
  const [unsaved, setUnsaved] = useState(false);
  /** "Dheere bolo" slows the voice for the rest of this dish. */
  const [pace, setPace] = useState<Pace | null>(null);
  const waiting = useOutbox((s) => s.ops.some((o) => o.sessionId === session.id));
  const scroll = useRef<ScrollViewInstance>(null);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (advanceTimer.current && clearTimeout(advanceTimer.current)), []);

  // KIT-076: keep what's needed to finish this dish with no network, and fetch this cook's step recordings once.
  useEffect(() => {
    const had = getBundle(session.id);
    putBundle(session.id, { householdId, session, doc });
    if (had && Object.keys(had.audio).length) return;
    services.cooking
      .getStepAudio(session.id)
      .then((audio) => downloadStepAudio(session.id, audio))
      .catch(() => {
        // No recordings yet (or no network): steps are read by the phone's own voice.
      });
    // Once per session: later step moves update the bundle themselves.
  }, [session.id]);

  const step: RecipeStepDoc = doc.steps[stepNo - 1]!;
  const last = stepNo === total;

  const allTimers = useTimers((s) => s.timers);
  const startTimer = useTimers((s) => s.start);
  const stopTimer = useTimers((s) => s.cancel);
  const clearTimers = useTimers((s) => s.clearSession);
  const silent = useTimers((s) => s.silent);
  const timers = useMemo(() => allTimers.filter((x) => x.sessionId === session.id), [allTimers, session.id]);
  const now = useNow(timers.length > 0);

  const eaters = session.whoEating.length ? members.filter((m) => session.whoEating.includes(m.id)) : members;
  const branch = useMemo(
    () => familyBranches(doc, eaters.map((e) => ({ name: e.displayName, ageGroup: e.ageGroup }))).find((b) => b.step === stepNo),
    [doc, eaters, stepNo],
  );

  const go = (delta: number): number => {
    const next = Math.max(1, Math.min(total, stepNo + delta));
    if (next === stepNo) return stepNo;
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    hush();
    setReading(false);
    tick();
    setStepNo(next);
    scroll.current?.scrollTo({ y: 0, animated: false });
    // Offline, the move waits in the outbox and this resolves straight away.
    services.cooking.advanceStep(session.id, next - stepNo).then(
      () => setUnsaved(false),
      () => setUnsaved(true),
    );
    return next;
  };

  const complete = useMutation({
    mutationFn: () => services.cooking.completeSession(session.id),
    onSuccess: () => {
      hush();
      buzz();
      void clearTimers(session.id);
    },
  });

  // Swipe left for the next step, right for the one before (COOK-09). Mostly-vertical drags still scroll.
  const goRef = useRef(go);
  goRef.current = go;
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 28 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
        onPanResponderRelease: (_, g) => {
          if (g.dx < -56) goRef.current(1);
          else if (g.dx > 56) goRef.current(-1);
        },
      }),
    [],
  );

  const leave = () => {
    void queryClient.invalidateQueries({ queryKey: ["cook-active"] });
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };

  // Hands-free listening (KIT-084). The hook sits above the finish screen's early return; the handlers it calls are
  // defined further down and reach it through refs. It stops listening once the dish is finished.
  const commandRef = useRef<(m: FastPathMatch) => void>(() => {});
  const unknownRef = useRef<() => void>(() => {});
  const handsFree = useHandsFree({
    lang: locale === "en" ? "en-IN" : "hi-IN",
    paused: reading || complete.isSuccess,
    onCommand: (m) => commandRef.current(m),
    onUnknown: () => unknownRef.current(),
  });

  if (complete.isSuccess) {
    return (
      <ScrollView contentContainerStyle={styles.finish} keyboardShouldPersistTaps="handled">
        <FinishSheet
          sessionId={session.id}
          householdId={householdId}
          dish={dish}
          lines={complete.data}
          recipeId={doc.parent_id ?? doc.id ?? doc.slug}
          memberId={memberId ?? undefined}
          changes={changes}
          leftoverNote={safetyText([leftoverSafety(doc.ingredients)].filter((x) => x !== null), locale)}
          offline={getBundle(session.id)?.finishedOffline === true}
          onClose={() => {
            removeStepAudio(session.id);
            void queryClient.invalidateQueries({ queryKey: ["kitchen"] });
            void queryClient.invalidateQueries({ queryKey: ["memories"] });
            void queryClient.invalidateQueries({ queryKey: ["picks"] });
            void queryClient.invalidateQueries({ queryKey: ["cook-active"] });
            router.replace("/");
          }}
        />
      </ScrollView>
    );
  }

  const secs = stepSeconds(step);
  const stepTimer = timers.find((x) => x.stepNo === stepNo);
  const offerTimer = secs !== null && !stepTimer && offersTimer(step);
  const count = whistles[stepNo] ?? 0;
  const photo = last ? dishImage(doc.slug) : null;
  const photoSize = Math.min(screenWidth - space.gutter * 2, 320);

  /** Reads a step: this cook's recording when the phone has it (works offline), else the phone's own voice. */
  const readStep = (n: number) => {
    const s = doc.steps[n - 1];
    if (!s) return;
    setReading(true);
    const done = () => setReading(false);
    const p = pace ?? voice.profile.pace;
    if (playStepAudio(session.id, n, { rate: RECORDING_RATE[p], onEnd: done })) return;
    // Recipe text is written in English for now, so it is read by the English voice.
    // KIT-068: the same words the voice agent would say for this cook (cue for learners, safety always).
    say(stepWords(s, voice.profile), { language: "en-IN", onEnd: done });
  };

  /** A short spoken reply; listening pauses until it ends. */
  const speak = (text: string) => {
    setReading(true);
    say(text, { onEnd: () => setReading(false) });
  };

  const read = () => {
    if (reading) {
      hush();
      setReading(false);
      return;
    }
    readStep(stepNo);
  };

  const whistle = () => {
    const target = step.whistles!;
    const r = countWhistle(count, target);
    setWhistles((w) => ({ ...w, [stepNo]: r.count }));
    buzz();
    if (r.reached) {
      say(t("cook.whistle.done", { n: target }));
      if (!last) advanceTimer.current = setTimeout(() => goRef.current(1), WHISTLE_ADVANCE_MS);
    } else {
      say(t("cook.whistle.say", { n: r.count }));
    }
  };

  // KIT-084: the same commands as the voice agent's fast path, heard on the phone.
  const command = (m: FastPathMatch) => {
    tick();
    switch (m.command) {
      case "next":
        if (last) speak(t("cook.hf.lastStep"));
        else readStep(go(1));
        return;
      case "back":
        readStep(go(-1));
        return;
      case "repeat":
      case "resume":
        readStep(stepNo);
        return;
      case "slower": {
        const slower: Pace = (pace ?? voice.profile.pace) === "fast" ? "normal" : "slow";
        setPace(slower);
        setSpeechPace(slower);
        speak(t("cook.hf.slower"));
        return;
      }
      case "pause":
        hush();
        setReading(false);
        return;
      case "done":
        if (last) complete.mutate();
        else speak(t("cook.hf.stepsLeft", { n: total - stepNo }));
        return;
      case "whistle":
        if (step.whistles) whistle();
        else speak(t("cook.hf.hint"));
        return;
      case "timer_set": {
        const sec = Math.round((m.minutes ?? 0) * 60);
        if (sec <= 0) return;
        void startTimer({ sessionId: session.id, stepNo, label: m.label ?? t("cook.timer.label", { n: stepNo }), durationSec: sec });
        speak(t("cook.hf.timerSet", { time: durationLabel(sec) }));
        return;
      }
      case "timer_check": {
        const at = Date.now();
        const next = timers.filter((x) => x.endsAt > at).sort((a, b) => a.endsAt - b.endsAt)[0];
        speak(next ? t("cook.hf.timeLeft", { label: next.label, time: durationLabel(remaining(next, at)) }) : t("cook.hf.noTimer"));
        return;
      }
    }
  };
  commandRef.current = command;
  unknownRef.current = () => speak(t("cook.hf.hint"));

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.header}>
        <IconButton label={t("cook.leave")} onPress={leave}>
          <Icon name="close" />
        </IconButton>
        <View style={styles.headerText}>
          <Text variant="bodyStrong" accessibilityLiveRegion="polite">
            {t("cook.stepOf", { n: stepNo, total })}
          </Text>
          <Text variant="caption" muted numberOfLines={1}>
            {dish}
          </Text>
        </View>
        <IconButton
          label={handsFree.state === "listening" ? t("cook.hf.stop") : t("cook.hf.start")}
          onPress={() => void handsFree.toggle()}
          muted={handsFree.state !== "listening"}
        >
          <Icon name="mic" />
        </IconButton>
        <IconButton label={reading ? t("cook.stopReading") : t("cook.read")} onPress={read} muted={reading}>
          <Icon name="speaker" />
        </IconButton>
      </View>
      {handsFree.state !== "off" ? (
        <Text variant="caption" muted style={styles.status} accessibilityLiveRegion="polite">
          {t(handsFree.state === "listening" ? "cook.hf.listening" : handsFree.state === "denied" ? "cook.hf.denied" : "cook.hf.unavailable")}
        </Text>
      ) : null}
      <View
        style={[styles.track, { backgroundColor: colors.line }]}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 1, max: total, now: stepNo }}
      >
        <View style={[styles.fill, { backgroundColor: colors.lime, width: `${(stepNo / total) * 100}%` }]} />
      </View>

      {waiting ? (
        <Text variant="caption" muted style={[styles.status, { paddingTop: space.sm }]} accessibilityLiveRegion="polite">
          {t("cook.offline")}
        </Text>
      ) : null}

      <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={styles.content} {...pan.panHandlers}>
        <TimerChips timers={timers} now={now} onStop={(timerId) => void stopTimer(timerId)} />
        {silent && timers.length ? (
          <Text variant="caption" muted>
            {t("cook.timer.silent")}
          </Text>
        ) : null}

        <Text variant="cookStep" accessibilityRole="header">
          {step.text}
        </Text>

        {step.safety ? (
          <View style={[styles.note, { backgroundColor: colors.alertSoft }]} accessibilityRole="alert">
            <Text variant="bodyStrong" color={colors.alert}>
              {t("recipe.safety")}
            </Text>
            <Text color={colors.alert}>{step.safety}</Text>
          </View>
        ) : null}

        {step.cue ? (
          <Card>
            <Text variant="label" muted>
              {t("recipe.cue")}
            </Text>
            <Text variant="bodyStrong">{step.cue}</Text>
          </Card>
        ) : null}

        {branch ? (
          <View style={[styles.note, { backgroundColor: colors.limePale }]}>
            <Text variant="label" muted>
              {t("cook.for", { name: branch.members.join(", ") })}
            </Text>
            <Text variant="bodyStrong">{branch.action}</Text>
          </View>
        ) : null}

        {notesForStep(session.changes, stepNo).map((n, i) => (
          <View key={i} style={[styles.note, { backgroundColor: colors.amberSoft }]}>
            <Text variant="label" muted>
              {t("cook.youChanged", { change: n.change })}
            </Text>
            <Text variant="bodyStrong">{n.note}</Text>
          </View>
        ))}

        {step.whistles ? (
          <WhistleCounter
            count={count}
            target={step.whistles}
            onWhistle={whistle}
            onUndo={() => setWhistles((w) => ({ ...w, [stepNo]: Math.max(0, count - 1) }))}
          />
        ) : null}

        {offerTimer ? (
          <Button
            kind="secondary"
            size="cook"
            label={t("cook.timer.start", { time: durationLabel(secs) })}
            onPress={() => {
              tick();
              void startTimer({ sessionId: session.id, stepNo, label: t("cook.timer.label", { n: stepNo }), durationSec: secs });
            }}
          />
        ) : null}

        {photo ? (
          <View style={{ gap: space.sm }}>
            <Text variant="label" muted>
              {t("cook.looksLike")}
            </Text>
            <Image source={photo} style={{ width: photoSize, height: photoSize, borderRadius: radius.card }} resizeMode="cover" accessibilityLabel={dish} />
          </View>
        ) : null}

        <Button kind="secondary" size="cook" label={t("cook.wrong")} onPress={() => router.push(`/rescue/${session.id}`)} />
        <View>
          <Button kind="quiet" label={t("assist.ask")} onPress={() => router.push(`/assist/${session.id}?mode=ask`)} />
          <Button kind="quiet" label={t("assist.changed")} onPress={() => router.push(`/assist/${session.id}?mode=changed`)} />
        </View>

        <Button
          kind="quiet"
          label={session.servings === 1 ? t("cook.ingredientsOne") : t("cook.ingredients", { n: session.servings })}
          onPress={() => setShowIngredients((v) => !v)}
        />
        {showIngredients ? (
          <Card>
            {doc.ingredients.map((ing, i) => (
              <View key={`${ing.ingredient}-${i}`} style={styles.ingRow}>
                <Text style={{ flex: 1 }}>{displayName(catalogEntry(ing.ingredient), ing.ingredient, locale)}</Text>
                <Text variant="label" muted>
                  {Object.values(rememberedAmount(ing, doc.base_servings, session.servings, changes.get(ing.ingredient))).filter(Boolean).join(" · ")}
                </Text>
              </View>
            ))}
          </Card>
        ) : null}

        {unsaved && !waiting ? (
          <Text variant="caption" muted accessibilityLiveRegion="polite">
            {t("cook.notSynced")}
          </Text>
        ) : null}
        {complete.isError ? (
          <Text color={colors.alert} accessibilityLiveRegion="polite">
            {t("state.error.body")}
          </Text>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: colors.canvas, borderTopColor: colors.line }]}>
        <View style={{ flex: 1 }}>
          <Button kind="secondary" size="cook" label={t("cook.back")} disabled={stepNo === 1} onPress={() => go(-1)} />
        </View>
        <View style={{ flex: 2 }}>
          {last ? (
            <Button
              size="cook"
              label={complete.isPending ? t("cook.finishing") : t("cook.finish")}
              disabled={complete.isPending}
              onPress={() => complete.mutate()}
            />
          ) : (
            <Button size="cook" label={t("cook.next")} onPress={() => go(1)} />
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  plain: { flex: 1, paddingHorizontal: space.gutter, paddingTop: space.lg, gap: space.lg },
  header: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.gutter, paddingTop: space.md, paddingBottom: space.md },
  headerText: { flex: 1, alignItems: "center", gap: 2 },
  status: { textAlign: "center", paddingHorizontal: space.gutter, paddingBottom: space.sm },
  track: { height: 6, marginHorizontal: space.gutter, borderRadius: radius.pill, overflow: "hidden" },
  fill: { height: 6, borderRadius: radius.pill },
  content: { paddingHorizontal: space.gutter, paddingTop: space.xl, paddingBottom: space.xxl, gap: space.lg },
  finish: { paddingHorizontal: space.gutter, paddingTop: space.lg, paddingBottom: space.xxxl, gap: space.lg },
  note: { borderRadius: radius.card, padding: space.lg, gap: space.xs },
  ingRow: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 36 },
  footer: { flexDirection: "row", gap: space.md, paddingHorizontal: space.gutter, paddingTop: space.md, paddingBottom: space.md, borderTopWidth: StyleSheet.hairlineWidth },
});
