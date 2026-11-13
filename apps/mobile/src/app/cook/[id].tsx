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
import { PanResponder, ScrollView, StyleSheet, View, type ScrollViewInstance } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { FinishSheet } from "@/components/cook/FinishSheet";
import { DirectionCard, HandCard, StepMeta, StepPhoto, StepProgress, StepTimerCard, TimeUpCard } from "@/components/cook/StepParts";
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
import { SlideIn } from "@/design-system/motion";
import { dishImage, stepImage } from "@/design-system/media";
import { Button, Card, IconButton, StateView, Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { radius, shadow, space } from "@/design-system/tokens";
import { notesForStep } from "@/domain/assist";
import { stepIngredients, tipFor } from "@/domain/tips";
import { calibrate, planFor, stoveSetting, type HeatVote, type Stove } from "@/domain/stoveGuide";
import { clash, kitchenCheck, type Busy, type Device } from "@/domain/kitchenLimits";
import { DEFAULT_POWER, has, heatOf, setHeat, type Tool } from "@/domain/tools";
import { useStove } from "@/state/stove";
import { useStepTimes } from "@/state/stepTimes";
import { recordStep, yourSeconds } from "@/domain/stepTimes";
import { StoveCard } from "@/components/cook/StoveCard";
import { AirFryerCard } from "@/components/cook/AirFryerCard";
import { checkWords, KitchenCheckCard } from "@/components/cook/KitchenCheckCard";
import { airFryFor } from "@/domain/airFryer";
import { countWhistle, offersTimer, remaining, stepSeconds, timerCue } from "@/domain/cooking";
import { displayName } from "@/domain/kitchen";
import { familyBranches, localDoc, recipeTitle, type RecipeDoc, type RecipeStepDoc } from "@/domain/recipes";
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

function Cooking({ session, doc: rawDoc, members, householdId }: { session: CookSession; doc: RecipeDoc; members: Member[]; householdId: string }) {
  // Remembered "more garlic" and the like (KIT-104), shown in the ingredient list.
  const changes = useAmountChanges(householdId, rawDoc);
  const voice = useVoiceProfile();
  const { colors } = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const locale = getLocale();
  // Steps, cues, safety and family notes in the cook's language; the bundle and the server keep the original.
  const doc = useMemo(() => localDoc(rawDoc, locale), [rawDoc, locale]);
  const memberId = useSession((s) => s.memberId);
  const total = doc.steps.length;
  const dish = recipeTitle(doc, locale);

  const [stepNo, setStepNo] = useState(() => Math.max(1, Math.min(total, session.currentStep)));
  /** Which way the last move went, so the new step slides in from that side. */
  const [dir, setDir] = useState<1 | -1 | 0>(0);
  /** The companion's last words in "Need a hand?". */
  const [reply, setReply] = useState(() => t("cook.hand.hello"));
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
    putBundle(session.id, { householdId, session, doc: rawDoc });
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
  const extendTimer = useTimers((s) => s.extend);
  const clearTimers = useTimers((s) => s.clearSession);
  const silent = useTimers((s) => s.silent);
  const timers = useMemo(() => allTimers.filter((x) => x.sessionId === session.id), [allTimers, session.id]);
  const now = useNow(timers.length > 0);

  const eaters = session.whoEating.length ? members.filter((m) => session.whoEating.includes(m.id)) : members;
  // S2: how long this cook really takes over hands-on steps (time between Next taps), kept on this phone.
  const stepTimes = useStepTimes((s) => s.times);
  const setStepTimes = useStepTimes((s) => s.set);
  const enteredAt = useRef(Date.now());
  const secondsFor = (n: number) => {
    const s = doc.steps[n - 1];
    return s ? yourSeconds(stepTimes, doc.slug, n, s) : null;
  };
  /** The step just finished with Next: one more measure of the cook's pace (skips and walk-aways are ignored). */
  const measure = (n: number) => {
    const s = doc.steps[n - 1];
    if (s) setStepTimes(recordStep(useStepTimes.getState().times, doc.slug, n, s, (Date.now() - enteredAt.current) / 1000, Date.now()));
  };
  // The setting for this step on the stove in use (gas or induction, from the household's kitchen tools).
  const tools = useQuery({ queryKey: ["tools", householdId], queryFn: () => services.kitchen.getTools(householdId) });
  const hasGas = has(tools.data, "gas_stove");
  const hasInduction = has(tools.data, "induction");
  const chosenStove = useStove((s) => s.stove);
  const setStove = useStove((s) => s.setStove);
  const stove: Stove | null = hasGas && hasInduction ? (chosenStove ?? "gas") : hasInduction ? "induction" : hasGas ? "gas" : null;
  const power = tools.data?.find((x) => x.type === "induction")?.details?.power ?? DEFAULT_POWER;
  // Air fryer mode for frying steps, chosen step by step.
  const [airSteps, setAirSteps] = useState<Set<number>>(new Set());
  const airPlan = has(tools.data, "air_fryer") ? airFryFor(doc.slug, stepNo, doc.steps[stepNo - 1] ?? {}, locale) : null;
  const airOn = !!airPlan && airSteps.has(stepNo);
  // A step moved to the other stove because this one was taken (or can't run with the air fryer).
  const [stepStove, setStepStove] = useState<Record<number, Stove>>({});
  const stoveFor = (n: number): Stove | null => stepStove[n] ?? stove;
  /** What step n runs on: the air fryer when chosen, else the stove when the step needs heat. */
  const deviceFor = (n: number): Device | null => {
    const s = doc.steps[n - 1];
    if (!s) return null;
    if (airSteps.has(n) && has(tools.data, "air_fryer") && airFryFor(doc.slug, n, s, locale)) return "air_fryer";
    return planFor(s) ? stoveFor(n) : null;
  };
  const stepStoveNow = stoveFor(stepNo);
  /** Pan notes ("use a flat-bottom kadai") are shown once per cook. */
  const notesSeen = useRef<Set<string>>(new Set());
  const settingFor = (n: number) => {
    const s = doc.steps[n - 1];
    const on = stoveFor(n);
    return s && on ? stoveSetting(s, on, power, locale, notesSeen.current, heatOf(tools.data, on)?.shift ?? 0) : null;
  };
  const setting = useMemo(() => settingFor(stepNo), [stepNo, stepStoveNow, power, locale, doc, tools.data]); // eslint-disable-line react-hooks/exhaustive-deps

  // S1: "Too hot" / "Too slow". Saved on the household's stove, so every phone in the house learns it.
  const [heard, setHeard] = useState<{ text: string; undo: boolean; before?: Tool[] } | null>(null);
  useEffect(() => setHeard(null), [stepNo]);
  const saveTools = useMutation({
    mutationFn: (next: Tool[]) => services.kitchen.setTools(householdId, next),
    onMutate: (next) => queryClient.setQueryData(["tools", householdId], next),
  });
  const vote = (v: HeatVote) => {
    if (!stepStoveNow || !tools.data) return;
    const before = tools.data;
    const { next, changed } = calibrate(heatOf(before, stepStoveNow), v);
    saveTools.mutate(setHeat(before, stepStoveNow, next.shift || next.pending ? next : undefined));
    const where = locale === "en" ? t(`cook.stove.${stepStoveNow}`).toLowerCase() : t(`cook.stove.${stepStoveNow}`);
    setHeard(
      changed
        ? { text: t(v === "hot" ? "cook.heat.lower" : "cook.heat.higher", { stove: where }), undo: true, before }
        : { text: t(v === "hot" ? "cook.heat.notedHot" : "cook.heat.notedSlow", { stove: where }), undo: false },
    );
  };
  useEffect(() => {
    if (setting?.noteKey) notesSeen.current.add(setting.noteKey);
  }, [setting]);

  const tip = useMemo(() => {
    // Prefer a tip about what the first step actually uses (besan batter, not onions, when step 1 is the batter).
    const names = (k: string) => { const c = catalogEntry(k); return c ? [c.latn ?? "", c.hi ?? "", ...(c.aliases ?? [])] : []; };
    const focus = stepIngredients(rawDoc.steps[0]?.text ?? "", rawDoc.ingredients.map((i) => i.ingredient), names);
    return tipFor(rawDoc, Math.floor(Date.now() / 86_400_000), locale, focus);
  }, [rawDoc, locale]);
  const branch = useMemo(
    () => familyBranches(doc, eaters.map((e) => ({ name: e.displayName, ageGroup: e.ageGroup }))).find((b) => b.step === stepNo),
    [doc, eaters, stepNo],
  );

  // `channel` is "voice" when a spoken command moved the step: taps and voice are counted apart (hands-free rate).
  const go = (delta: number, channel: "touch" | "voice" = "touch"): number => {
    const next = Math.max(1, Math.min(total, stepNo + delta));
    if (next === stepNo) return stepNo;
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    hush();
    setReading(false);
    tick();
    if (next === stepNo + 1) measure(stepNo);
    enteredAt.current = Date.now();
    setDir(next > stepNo ? 1 : -1);
    setStepNo(next);
    scroll.current?.scrollTo({ y: 0, animated: false });
    // Offline, the move waits in the outbox and this resolves straight away.
    services.cooking.advanceStep(session.id, next - stepNo, channel).then(
      () => setUnsaved(false),
      () => setUnsaved(true),
    );
    return next;
  };

  const complete = useMutation({
    mutationFn: () => services.cooking.completeSession(session.id),
    onMutate: () => measure(stepNo),
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
          cookChanges={session.changes.map((c) => c.change)}
          eaters={eaters.map((m) => ({ id: m.id, name: m.displayName }))}
          leftoverNote={safetyText([leftoverSafety(doc.ingredients)].filter((x) => x !== null), locale)}
          offline={getBundle(session.id)?.finishedOffline === true}
          photo={dishImage(doc.slug)}
          steps={total}
          onShare={(picked) =>
            router.push({
              pathname: "/community/share",
              params: {
                recipeId: doc.parent_id ?? doc.id ?? doc.slug,
                slug: doc.slug,
                title: dish,
                changes: [...picked, ...[...changes.entries()].map(([ing, c]) => t(c.amount === "more" ? "community.moreOf" : "community.lessOf", { item: displayName(catalogEntry(ing), ing, locale) }))].join("|"),
              },
            })
          }
          onClose={() => {
            removeStepAudio(session.id);
            void queryClient.invalidateQueries({ queryKey: ["kitchen"] });
            void queryClient.invalidateQueries({ queryKey: ["memories"] });
            void queryClient.invalidateQueries({ queryKey: ["picks"] });
            void queryClient.invalidateQueries({ queryKey: ["weekRecap"] });
            void queryClient.invalidateQueries({ queryKey: ["cook-active"] });
            void queryClient.invalidateQueries({ queryKey: ["plate"] });
            router.replace("/");
          }}
        />
      </ScrollView>
    );
  }

  const secs = secondsFor(stepNo) ?? stepSeconds(step);
  const stepTimer = timers.find((x) => x.stepNo === stepNo);
  // The step's own timer lives in the timer card; finished ones get a "Time's up" card; the rest stay as chips.
  const finished = timers.filter((x) => remaining(x, now) === 0);
  const otherRunning = timers.filter((x) => x !== stepTimer && remaining(x, now) > 0);
  const showTimerCard = secs !== null && (offersTimer(step) || !!stepTimer);
  // Is this step's stove or machine free, and can it run alongside what other steps' timers still have on?
  const need = deviceFor(stepNo);
  const busy: Busy[] = otherRunning.flatMap((x) => {
    const d = deviceFor(x.stepNo);
    return d ? [{ device: d, stepNo: x.stepNo, secondsLeft: remaining(x, now) }] : [];
  });
  const check = need ? kitchenCheck(need, busy, tools.data) : null;
  const checkTime = check ? durationLabel(check.with.secondsLeft) : "";
  // Induction and air fryer on one socket: say so whenever the air fryer is about to be used with the induction in play.
  const airClash = airOn && hasInduction && clash(tools.data, "air_fryer", "induction");
  const count = whistles[stepNo] ?? 0;
  const startStepTimer = (n: number) => {
    const s = doc.steps[n - 1];
    const sec = s ? (secondsFor(n) ?? stepSeconds(s)) : null;
    if (!s || !sec) return;
    tick();
    void startTimer({ sessionId: session.id, stepNo: n, label: t("cook.timer.label", { n }), durationSec: sec, cue: timerCue(s) });
  };

  /** Reads a step: this cook's recording when the phone has it (works offline), else the phone's own voice. */
  const readStep = (n: number) => {
    const s = doc.steps[n - 1];
    if (!s) return;
    setReading(true);
    const done = () => setReading(false);
    const p = pace ?? voice.profile.pace;
    // Recordings are made from the English text; in Hindi or Hinglish the phone reads the translated step.
    if (locale === "en" && playStepAudio(session.id, n, { rate: RECORDING_RATE[p], onEnd: done })) return;
    // Recipe text is written in English for now, so it is read by the English voice.
    // KIT-068: the same words the voice agent would say for this cook (cue for learners, safety always).
    const setting = settingFor(n);
    const warn = n === stepNo && check && need ? Object.values(checkWords(check, need, checkTime)).join(". ") : null;
    say([warn, stepWords(s, voice.profile), setting?.line].filter(Boolean).join(". "), { language: locale === "hi" ? "hi-IN" : "en-IN", onEnd: done });
  };

  /** A short spoken reply; listening pauses until it ends. */
  const speak = (text: string) => {
    setReply(text);
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
        else readStep(go(1, "voice"));
        return;
      case "back":
        readStep(go(-1, "voice"));
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
        void startTimer({ sessionId: session.id, stepNo, label: m.label ?? t("cook.timer.label", { n: stepNo }), durationSec: sec, cue: timerCue(step) });
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

  const nextHint = () => (last ? speak(t("cook.hand.lastStep")) : speak(t("cook.hand.nextIs", { text: doc.steps[stepNo]!.text })));

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.header}>
        <IconButton label={t("cook.leave")} onPress={leave}>
          <Icon name="close" />
        </IconButton>
        <View style={styles.headerText}>
          <Text variant="heading" numberOfLines={1}>
            {dish}
          </Text>
        </View>
        <IconButton label={t("timers.open")} onPress={() => router.push(`/timers/${session.id}`)} muted={!timers.length}>
          <Icon name="timer" />
        </IconButton>
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
      <View style={styles.top}>
        <StepMeta n={stepNo} total={total} heat={step.heat} />
        <StepProgress n={stepNo} total={total} />
      </View>
      {handsFree.state !== "off" ? (
        <Text variant="caption" muted style={styles.status} accessibilityLiveRegion="polite">
          {t(handsFree.state === "listening" ? "cook.hf.listening" : handsFree.state === "denied" ? "cook.hf.denied" : "cook.hf.unavailable")}
        </Text>
      ) : null}
      {waiting ? (
        <Text variant="caption" muted style={styles.status} accessibilityLiveRegion="polite">
          {t("cook.offline")}
        </Text>
      ) : null}

      <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={styles.content} {...pan.panHandlers}>
        {finished.map((x) => (
          <TimeUpCard
            key={x.id}
            timer={x}
            nextStep={x.stepNo === stepNo && !last ? stepNo + 1 : undefined}
            onDismiss={() => void stopTimer(x.id)}
            onMore={() => void extendTimer(x.id, 60)}
            onNext={() => {
              void stopTimer(x.id);
              readStep(go(1));
            }}
          />
        ))}
        <TimerChips timers={otherRunning} now={now} onStop={(timerId) => void stopTimer(timerId)} />
        {silent && timers.length ? (
          <Text variant="caption" muted>
            {t("cook.timer.silent")}
          </Text>
        ) : null}

        <SlideIn key={stepNo} from={dir} style={styles.step}>
          <StepPhoto source={stepImage(doc.slug, stepNo)} label={dish} time={secs ? durationLabel(secs) : undefined} finalLook={last} />

          {check && need ? (
            <KitchenCheckCard
              check={check}
              need={need}
              timeLeft={checkTime}
              onAlt={() => {
                tick();
                const alt = check.alt;
                if (alt === "gas" || alt === "induction") setStepStove((m) => ({ ...m, [stepNo]: alt }));
              }}
            />
          ) : null}

          <DirectionCard step={step} />

          {airPlan ? (
            <AirFryerCard
              plan={airPlan}
              on={airOn}
              warn={airClash ? t("limits.airFirst") : null}
              onToggle={() =>
                setAirSteps((a) => {
                  const n = new Set(a);
                  if (n.has(stepNo)) n.delete(stepNo);
                  else n.add(stepNo);
                  return n;
                })
              }
              onTimer={() => {
                tick();
                void startTimer({ sessionId: session.id, stepNo, label: t("air.timerLabel"), durationSec: airPlan.minutes * 60, cue: undefined });
              }}
            />
          ) : null}

          {setting && stepStoveNow && !airOn ? (
            <StoveCard
              stove={stepStoveNow}
              line={setting.line}
              note={setting.note}
              both={hasGas && hasInduction}
              onStove={(s) => {
                // A step moved because of a clash keeps its own stove; the switch otherwise sets the usual one.
                if (stepStove[stepNo]) setStepStove((m) => ({ ...m, [stepNo]: s }));
                else setStove(s);
              }}
              onVote={tools.data ? vote : undefined}
              heard={heard}
              onUndo={() => {
                if (heard?.before) saveTools.mutate(heard.before);
                setHeard({ text: t("cook.heat.undone"), undo: false });
              }}
            />
          ) : null}

          {step.safety || airOn ? (
            <View style={[styles.note, { backgroundColor: colors.alertSoft }]} accessibilityRole="alert">
              <View style={styles.noteHead}>
                <Icon name="shield" size={18} color={colors.alert} />
                <Text variant="bodyStrong" color={colors.alert}>
                  {t("recipe.safety")}
                </Text>
              </View>
              {/* In the air fryer the hot-oil warning no longer applies; the hot basket does. */}
              <Text color={colors.alert}>{airOn ? t("air.safety") : step.safety}</Text>
            </View>
          ) : null}

          {branch ? (
            <View style={[styles.note, { backgroundColor: colors.primaryPale }]}>
              <Text variant="label" muted>
                {t("cook.for", { name: branch.members.join(", ") })}
              </Text>
              <Text variant="bodyStrong">{branch.action}</Text>
            </View>
          ) : null}

          {/* D4: one chef's tip per cook, on the first step. */}
          {stepNo === 1 ? (
            <View style={[styles.note, { backgroundColor: colors.primaryPale }]} accessibilityLabel={`${t("cook.tip")}: ${tip.text}`}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
                <Icon name="bulb" size={16} color={colors.primary} />
                <Text variant="label" weight={600} color={colors.primary}>
                  {t("cook.tip")}
                </Text>
              </View>
              <Text>{tip.text}</Text>
            </View>
          ) : null}

          {notesForStep(session.changes, stepNo).map((n, i) => (
            <View key={i} style={[styles.note, { backgroundColor: colors.peach }]}>
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

          {showTimerCard ? (
            <StepTimerCard
              seconds={secs}
              timer={stepTimer}
              now={now}
              onStart={() => startStepTimer(stepNo)}
              onStop={() => stepTimer && void stopTimer(stepTimer.id)}
              onMore={() => stepTimer && void extendTimer(stepTimer.id, 60)}
            />
          ) : null}
        </SlideIn>

        <HandCard
          listening={handsFree.state === "listening"}
          reply={reply}
          onHeat={() => router.push(`/rescue/${session.id}`)}
          onNext={nextHint}
          onAsk={() => router.push(`/assist/${session.id}?mode=ask`)}
          onChanged={() => router.push(`/assist/${session.id}?mode=changed`)}
        />

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

      <View style={[styles.footer, shadow.float, { backgroundColor: colors.canvas }]}>
        <View style={{ flex: 1 }}>
          <Button kind="secondary" size="cook" stretch icon="arrowLeft" label={t("cook.prev")} disabled={stepNo === 1} onPress={() => go(-1)} />
        </View>
        <View style={{ flex: 1.3 }}>
          {last ? (
            <Button
              kind="accent"
              size="cook"
              stretch
              icon="check"
              label={complete.isPending ? t("cook.finishing") : t("cook.finish")}
              disabled={complete.isPending}
              onPress={() => complete.mutate()}
            />
          ) : (
            <Button kind="accent" size="cook" stretch iconAfter="arrowRight" label={t("cook.next")} onPress={() => go(1)} />
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  plain: { flex: 1, paddingHorizontal: space.gutter, paddingTop: space.lg, gap: space.lg },
  header: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.gutter, paddingTop: space.md, paddingBottom: space.md },
  headerText: { flex: 1, gap: 2 },
  top: { paddingHorizontal: space.gutter, gap: space.md, paddingBottom: space.sm },
  status: { textAlign: "center", paddingHorizontal: space.gutter, paddingBottom: space.sm },
  content: { paddingHorizontal: space.gutter, paddingTop: space.md, paddingBottom: space.xxl, gap: space.lg },
  step: { gap: space.lg },
  noteHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  finish: { paddingHorizontal: space.gutter, paddingTop: space.lg, paddingBottom: space.xxxl, gap: space.lg },
  note: { borderRadius: radius.card, padding: space.lg, gap: space.xs },
  ingRow: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 36 },
  footer: { flexDirection: "row", gap: space.md, paddingHorizontal: space.gutter, paddingTop: space.md, paddingBottom: space.md, borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card },
});
