// All timers for one cooking session (Stitch "Multi Timer Hub", KIT-071): when several things are on the stove,
// every clock in one place, soonest first, each with its step and what to check when it rings, and quick ways to
// add or take off time. The recipe's other timed steps, and a few plain timers, can be started from here.
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { AppHeader } from "@/components/AppHeader";
import { useNow } from "@/components/cook/useNow";
import { Icon } from "@/design-system/icons";
import { Enter, Layout, PressableScale, Pulse } from "@/design-system/motion";
import { Badge, Button, Chip, Screen, SectionHeader, StateView, Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { radius, shadow, space } from "@/design-system/tokens";
import { clock, remaining, stepSeconds, timerBoard, timerCue } from "@/domain/cooking";
import { localDoc, recipeTitle } from "@/domain/recipes";
import { getLocale, t, useLocale } from "@/i18n";
import { services } from "@/services";
import { tick } from "@/services/feedback";
import { useTimers, type RunningTimer } from "@/state/timers";

const PLAIN_MINUTES = [1, 3, 5, 10];
/** Under this, a running timer is "almost done" and turns terracotta. */
const SOON_SEC = 60;

function minutesLabel(sec: number): string {
  return sec < 60 ? t("cook.dur.sec", { n: sec }) : t("cook.dur.min", { n: Math.round(sec / 60) });
}

export default function TimersScreen() {
  useLocale();
  const router = useRouter();
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const session = useQuery({ queryKey: ["cook", id], queryFn: () => services.cooking.getSession(id!), enabled: !!id });
  const recipe = useQuery({
    queryKey: ["recipe", session.data?.recipeId],
    queryFn: () => services.recipe.getRecipe(session.data!.recipeId),
    enabled: !!session.data,
  });
  const locale = getLocale();
  const doc = useMemo(() => (recipe.data ? localDoc(recipe.data, locale) : null), [recipe.data, locale]);

  const all = useTimers((s) => s.timers);
  const start = useTimers((s) => s.start);
  const extend = useTimers((s) => s.extend);
  const cancel = useTimers((s) => s.cancel);
  const mine = useMemo(() => all.filter((x) => x.sessionId === id), [all, id]);
  const now = useNow(mine.length > 0);
  const board = timerBoard(mine, doc?.steps ?? []);
  const running = board.timers.filter((x) => remaining(x, now) > 0);
  const next = running[0];

  const startStep = (stepNo: number) => {
    const s = doc?.steps[stepNo - 1];
    const sec = s ? stepSeconds(s) : null;
    if (!s || !sec) return;
    tick();
    void start({ sessionId: id!, stepNo, label: t("cook.timer.label", { n: stepNo }), durationSec: sec, cue: timerCue(s) });
  };
  const startPlain = (min: number) => {
    tick();
    void start({ sessionId: id!, stepNo: 0, label: t("timers.plain", { n: min }), durationSec: min * 60 });
  };

  return (
    <Screen header={<AppHeader title={t("timers.title")} back mic={false} />} tabBar={false}>
      {session.isPending || (session.isSuccess && recipe.isPending) ? (
        <StateView state="loading" title={t("timers.title")} />
      ) : session.isError || recipe.isError || !doc ? (
        <StateView state="error" title={t("cook.notFound")} body={t("state.error.body")} actionLabel={t("state.retry")} onAction={() => void session.refetch()} />
      ) : (
        <>
          <Enter>
            <View style={[styles.summary, { backgroundColor: colors.primaryContainer }]}>
              <View style={styles.row}>
                {running.length ? <Pulse color="#FFFFFF" /> : null}
                <Text variant="overline" color="#FFFFFF">
                  {(running.length ? t("timers.running", { n: running.length }) : t("timers.none")).toUpperCase()}
                </Text>
              </View>
              <Text variant="title" color="#FFFFFF">
                {recipeTitle(doc, locale)}
              </Text>
              {next ? (
                <Text color="#FFFFFF">{t("timers.next", { label: next.label, time: clock(remaining(next, now)) })}</Text>
              ) : (
                <Text color="#FFFFFF">{t("timers.noneBody")}</Text>
              )}
            </View>
          </Enter>

          {board.timers.map((x, i) => (
            <Layout key={x.id}>
              <TimerCard
                timer={x}
                index={i}
                now={now}
                step={x.stepNo ? doc.steps[x.stepNo - 1]?.text : undefined}
                onAdd={(sec) => void extend(x.id, sec)}
                onStop={() => void cancel(x.id)}
              />
            </Layout>
          ))}

          {board.startable.length ? (
            <>
              <SectionHeader title={t("timers.fromRecipe")} dot={undefined} />
              {board.startable.map((s) => (
                <PressableScale
                  key={s.stepNo}
                  accessibilityRole="button"
                  accessibilityLabel={t("timers.startStep", { n: s.stepNo, time: minutesLabel(s.seconds) })}
                  onPress={() => startStep(s.stepNo)}
                  style={[styles.startRow, { backgroundColor: colors.surfaceMuted }]}
                >
                  <Icon name="hourglass" size={20} color={colors.inkSecondary} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="label" weight={600}>
                      {t("timers.stepTime", { n: s.stepNo, time: minutesLabel(s.seconds) })}
                    </Text>
                    <Text variant="caption" muted numberOfLines={1}>
                      {doc.steps[s.stepNo - 1]?.text}
                    </Text>
                  </View>
                  <Icon name="play" size={20} color={colors.accentText} />
                </PressableScale>
              ))}
            </>
          ) : null}

          <SectionHeader title={t("timers.quick")} dot={undefined} />
          <View style={styles.chips}>
            {PLAIN_MINUTES.map((m) => (
              <Chip key={m} icon="timer" label={t("timers.plain", { n: m })} onPress={() => startPlain(m)} />
            ))}
          </View>

          <Button kind="accent" size="cook" stretch icon="cook" label={t("timers.back")} onPress={() => (router.canGoBack() ? router.back() : router.replace(`/cook/${id}`))} />
        </>
      )}
    </Screen>
  );
}

const RING = 92;
const STROKE = 7;

function TimerCard({
  timer,
  index,
  now,
  step,
  onAdd,
  onStop,
}: {
  timer: RunningTimer;
  index: number;
  now: number;
  step?: string;
  onAdd: (sec: number) => void;
  onStop: () => void;
}) {
  const { colors } = useTheme();
  const left = remaining(timer, now);
  const state = left === 0 ? "done" : left <= SOON_SEC ? "soon" : "running";
  const tint = state === "running" ? colors.primary : colors.accent;
  const r = (RING - STROKE) / 2;
  const c = 2 * Math.PI * r;
  const share = Math.max(0, Math.min(1, left / Math.max(1, timer.durationSec)));
  return (
    <Enter index={index}>
      <View
        style={[styles.card, state === "done" ? shadow.glow : shadow.card, { backgroundColor: state === "done" ? colors.peach : colors.surface }]}
        accessibilityLiveRegion={state === "done" ? "assertive" : "none"}
      >
        <View style={styles.cardTop}>
          <View style={styles.ring} accessible accessibilityRole="timer" accessibilityLabel={state === "done" ? t("cook.timer.doneTitle", { label: timer.label }) : t("cook.timer.left", { label: timer.label, time: clock(left) })}>
            <Svg width={RING} height={RING} style={StyleSheet.absoluteFill}>
              <Circle cx={RING / 2} cy={RING / 2} r={r} stroke={colors.surfaceHigh} strokeWidth={STROKE} fill="none" />
              <Circle
                cx={RING / 2}
                cy={RING / 2}
                r={r}
                stroke={tint}
                strokeWidth={STROKE}
                fill="none"
                strokeLinecap="round"
                strokeDasharray={`${c} ${c}`}
                strokeDashoffset={c * (1 - share)}
                transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
              />
            </Svg>
            <Text variant="subheading" style={styles.clock}>
              {clock(left)}
            </Text>
          </View>
          <View style={{ flex: 1, gap: space.xs }}>
            <Badge
              tone={state === "done" ? "alert" : state === "soon" ? "accent" : "primary"}
              label={state === "done" ? t("cook.timeUp.title") : state === "soon" ? t("timers.soon") : t("cook.timer.running")}
            />
            <Text variant="subheading">{timer.label}</Text>
            {step ? (
              <Text variant="caption" muted numberOfLines={2}>
                {step}
              </Text>
            ) : null}
          </View>
        </View>
        {timer.cue ? (
          <View style={[styles.cue, { backgroundColor: state === "done" ? colors.surface : colors.surfaceMuted }]}>
            <Icon name="eye" size={18} color={colors.primaryText} />
            <Text variant="label" style={{ flex: 1 }}>
              {timer.cue}
            </Text>
          </View>
        ) : null}
        <View style={styles.controls}>
          {state !== "done" ? <Chip label="−30s" onPress={() => onAdd(-30)} /> : null}
          <Chip label="+30s" onPress={() => onAdd(30)} />
          <Chip label="+1m" onPress={() => onAdd(60)} />
          <View style={{ flex: 1 }} />
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={state === "done" ? t("cook.timeUp.gotIt") : t("cook.timer.cancel", { label: timer.label })}
            onPress={onStop}
            style={[styles.stop, { backgroundColor: state === "done" ? colors.accent : colors.surfaceMuted }]}
          >
            <Icon name={state === "done" ? "check" : "close"} size={18} color={state === "done" ? colors.onAccent : colors.inkSecondary} />
            <Text variant="label" weight={600} color={state === "done" ? colors.onAccent : colors.inkSecondary}>
              {state === "done" ? t("cook.timeUp.gotIt") : t("cook.timer.stop")}
            </Text>
          </PressableScale>
        </View>
      </View>
    </Enter>
  );
}

const styles = StyleSheet.create({
  summary: { borderRadius: radius.cardLg, padding: space.xl, gap: space.sm },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm },
  card: { borderRadius: radius.cardLg, padding: space.lg, gap: space.md },
  cardTop: { flexDirection: "row", alignItems: "center", gap: space.lg },
  ring: { width: RING, height: RING, alignItems: "center", justifyContent: "center" },
  clock: { fontVariant: ["tabular-nums"] },
  cue: { flexDirection: "row", alignItems: "flex-start", gap: space.sm, borderRadius: radius.item, padding: space.md },
  controls: { flexDirection: "row", alignItems: "center", gap: space.sm },
  stop: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: radius.pill, paddingHorizontal: space.md, minHeight: 44 },
  startRow: { flexDirection: "row", alignItems: "center", gap: space.md, borderRadius: radius.card, padding: space.md },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
});
