// The pieces of the Cook With Me step (Stitch "Active Cooking Session"): segmented progress, the step photo, the
// "What to do" card with cues by sense, the step timer with its ring, the "Time's up" card and "Need a hand?".
import { useEffect } from "react";
import { Image, type ImageSourcePropType, StyleSheet, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { Icon, type IconName } from "@/design-system/icons";
import { Animated, Enter, PressableScale, Pulse, useReducedMotion } from "@/design-system/motion";
import { Badge, Button, Chip, Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { motion, radius, shadow, space } from "@/design-system/tokens";
import { clock, remaining } from "@/domain/cooking";
import { cueSenses, type Heat, type RecipeStepDoc, type Sense } from "@/domain/recipes";
import { shortStep } from "@/domain/habits";
import { t } from "@/i18n";
import type { RunningTimer } from "@/state/timers";
import { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

const SENSE_ICON: Record<Sense, IconName> = { look: "eye", sound: "ear", smell: "nose", touch: "hand", taste: "spoon" };

/** "STEP 3 OF 6" pill and the heat for this step. */
export function StepMeta({ n, total, heat }: { n: number; total: number; heat?: Heat }) {
  const { colors } = useTheme();
  return (
    <View style={styles.meta}>
      <View style={[styles.pill, { backgroundColor: colors.accentSoft }]}>
        <Text variant="overline" color={colors.accentText} accessibilityLiveRegion="polite">
          {t("cook.stepOf", { n, total }).toUpperCase()}
        </Text>
      </View>
      {heat ? (
        <View style={[styles.heat, { backgroundColor: colors.surfaceMuted }]}>
          <Icon name="flame" size={16} color={colors.accentText} />
          <Text variant="label" color={colors.inkSecondary}>
            {t(`cook.heat.${heat}`)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/** One segment per step: done olive, current terracotta, to come grey. Each segment eases to its colour. */
export function StepProgress({ n, total }: { n: number; total: number }) {
  return (
    <View style={styles.segments} accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: total, now: n }}>
      {Array.from({ length: total }, (_, i) => (
        <Segment key={i} state={i + 1 < n ? "done" : i + 1 === n ? "now" : "todo"} />
      ))}
    </View>
  );
}

function Segment({ state }: { state: "done" | "now" | "todo" }) {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const fill = useSharedValue(state === "todo" ? 0 : 1);
  useEffect(() => {
    const v = state === "todo" ? 0 : 1;
    fill.value = reduce ? v : withTiming(v, { duration: motion.slow, easing: Easing.out(Easing.cubic) });
  }, [state, reduce, fill]);
  const style = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));
  return (
    <View style={[styles.segment, { backgroundColor: colors.surfaceHigh }]}>
      <Animated.View style={[styles.segmentFill, { backgroundColor: state === "now" ? colors.accent : colors.primary }, style]} />
    </View>
  );
}

/** The dish photo with what this step needs on top: the time, and "It should look like this" on the last step. */
export function StepPhoto({ source, label, time, finalLook }: { source: ImageSourcePropType | null; label: string; time?: string; finalLook?: boolean }) {
  const { colors } = useTheme();
  if (!source) return null;
  return (
    <View style={[styles.photo, { backgroundColor: colors.surfaceMuted }]}>
      <Image source={source} style={styles.photoImage} resizeMode="cover" accessibilityLabel={label} />
      {finalLook ? (
        <View style={styles.photoTop}>
          <PhotoTag icon="eye" label={t("cook.looksLike")} />
        </View>
      ) : null}
      <View style={styles.photoBottom}>
        <PhotoTag icon="skillet" label={label} />
        {time ? <PhotoTag icon="timer" label={time} /> : null}
      </View>
    </View>
  );
}

function PhotoTag({ icon, label }: { icon: IconName; label: string }) {
  return (
    <View style={styles.photoTag}>
      <Icon name={icon} size={14} color="#FFFFFF" />
      <Text variant="label" color="#FFFFFF" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** "What to do": the instruction, then how to tell it's right by sense, then the warning in terracotta. */
/** `brief`: the cook knows this dish (S7), so just the first sentence, with the full step one tap away. */
export function DirectionCard({ step, brief, onFull }: { step: RecipeStepDoc; brief?: boolean; onFull?: () => void }) {
  const { colors } = useTheme();
  const short = brief ? shortStep(step.text) : step.text;
  const cut = short !== step.text;
  const senses = cueSenses(step);
  const avoid = step.cues?.avoid;
  // Older recipes have only the one-line cue.
  const fallback = !senses.length && !avoid ? step.cue : undefined;
  return (
    <View style={[styles.card, shadow.card, { backgroundColor: colors.surface }]}>
      <View style={styles.label}>
        <Icon name="cook" size={18} color={colors.primaryText} />
        <Text variant="overline" color={colors.primaryText}>
          {t("cook.whatToDo").toUpperCase()}
        </Text>
      </View>
      <Text variant="cookStep" accessibilityRole="header">
        {short}
      </Text>
      {cut && onFull ? (
        <View style={{ alignSelf: "flex-start" }}>
          <Button kind="quiet" size="small" label={t("cook.fullSteps")} onPress={onFull} />
        </View>
      ) : null}
      {senses.length || avoid || fallback ? (
        <View style={[styles.cues, { backgroundColor: colors.surfaceMuted }]}>
          <View style={styles.cueHead}>
            <View style={[styles.bulb, { backgroundColor: colors.accentSoft }]}>
              <Icon name="bulb" size={18} color={colors.accentText} />
            </View>
            <Text variant="bodyStrong">{t("cook.howToTell")}</Text>
          </View>
          {senses.map(({ sense, text }, i) => (
            <Enter key={sense} index={i} delay={motion.quick}>
              <View style={styles.cueRow} accessible accessibilityLabel={`${t(`cook.sense.${sense}`)}: ${text}`}>
                <Icon name={SENSE_ICON[sense]} size={20} color={colors.primaryText} />
                <View style={{ flex: 1 }}>
                  <Text variant="overline" muted>
                    {t(`cook.sense.${sense}`).toUpperCase()}
                  </Text>
                  <Text>{text}</Text>
                </View>
              </View>
            </Enter>
          ))}
          {fallback ? <Text>{fallback}</Text> : null}
          {avoid ? (
            <Enter index={senses.length} delay={motion.quick}>
              <View style={[styles.avoid, { backgroundColor: colors.accentSoft }]} accessibilityRole="alert">
                <Icon name="warning" size={20} color={colors.accentText} />
                <View style={{ flex: 1 }}>
                  <Text variant="overline" color={colors.accentText}>
                    {t("cook.avoid").toUpperCase()}
                  </Text>
                  <Text color={colors.accentText}>{avoid}</Text>
                </View>
              </View>
            </Enter>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const RING = 132;
const STROKE = 8;

function Ring({ share, color, track }: { share: number; color: string; track: string }) {
  const r = (RING - STROKE) / 2;
  const c = 2 * Math.PI * r;
  return (
    <Svg width={RING} height={RING} style={StyleSheet.absoluteFill}>
      <Circle cx={RING / 2} cy={RING / 2} r={r} stroke={track} strokeWidth={STROKE} fill="none" />
      <Circle
        cx={RING / 2}
        cy={RING / 2}
        r={r}
        stroke={color}
        strokeWidth={STROKE}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={`${c} ${c}`}
        strokeDashoffset={c * (1 - Math.max(0, Math.min(1, share)))}
        transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
      />
    </Svg>
  );
}

/** The step's timer: ready with its time, running with a ring that empties, or done. */
export function StepTimerCard({
  seconds,
  timer,
  now,
  onStart,
  onStop,
  onMore,
}: {
  seconds: number;
  timer?: RunningTimer;
  now: number;
  onStart: () => void;
  onStop: () => void;
  onMore: () => void;
}) {
  const { colors } = useTheme();
  const left = timer ? remaining(timer, now) : seconds;
  const state = !timer ? "ready" : left === 0 ? "done" : "running";
  const badge = { ready: <Badge tone="primary" label={t("cook.timer.ready")} />, running: <Badge tone="accent" label={t("cook.timer.running")} />, done: <Badge tone="alert" label={t("cook.timer.done")} /> }[state];
  return (
    <View style={[styles.card, shadow.card, { backgroundColor: colors.surface }]}>
      <View style={styles.timerHead}>
        <View style={styles.label}>
          <Icon name="timer" size={18} color={colors.accentText} />
          <Text variant="overline" color={colors.inkSecondary}>
            {t("cook.timer.title").toUpperCase()}
          </Text>
        </View>
        <View style={styles.badgeRow}>
          {state === "running" ? <Pulse color={colors.accent} /> : null}
          {badge}
        </View>
      </View>
      <View style={styles.timerBody}>
        <View style={styles.ring} accessible accessibilityRole="timer" accessibilityLabel={clock(left)}>
          <Ring share={timer ? left / Math.max(1, timer.durationSec) : 1} color={state === "ready" ? colors.primary : colors.accent} track={colors.surfaceHigh} />
          <Text variant="title" style={styles.clock}>
            {clock(left)}
          </Text>
        </View>
      </View>
      <View style={styles.timerControls}>
        <Button kind="secondary" size="small" icon="plus" label={t("cook.timer.more")} accessibilityHint={t("cook.timer.moreLabel")} onPress={onMore} disabled={!timer} />
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={timer ? t("cook.timer.stop") : t("cook.timer.go")}
          onPress={timer ? onStop : onStart}
          style={[styles.play, shadow.glow, { backgroundColor: colors.accent }]}
        >
          <Icon name={timer ? "close" : "play"} size={28} color={colors.onAccent} />
        </PressableScale>
        <View style={{ width: 92 }} />
      </View>
    </View>
  );
}

/** A finished timer: what to check now, with "Got it", one more minute, and the next step when it was this step's. */
export function TimeUpCard({
  timer,
  nextStep,
  onDismiss,
  onMore,
  onNext,
}: {
  timer: RunningTimer;
  nextStep?: number;
  onDismiss: () => void;
  onMore: () => void;
  onNext?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Enter>
      <View style={[styles.card, styles.timeUp, shadow.glow, { backgroundColor: colors.peach }]} accessibilityRole="alert" accessibilityLiveRegion="assertive">
        <View style={styles.badgeRow}>
          <Pulse color={colors.accent} size={8} />
          <Text variant="overline" color={colors.accentText}>
            {`${t("cook.timeUp.title")} · ${timer.label}`.toUpperCase()}
          </Text>
        </View>
        <Text variant="display" color={colors.accentText} style={styles.clock}>
          00:00
        </Text>
        {timer.cue ? (
          <View style={[styles.avoid, { backgroundColor: colors.surface }]}>
            <Icon name="eye" size={20} color={colors.primaryText} />
            <View style={{ flex: 1 }}>
              <Text variant="overline" muted>
                {t("cook.timeUp.check").toUpperCase()}
              </Text>
              <Text>{timer.cue}</Text>
            </View>
          </View>
        ) : null}
        <View style={styles.timeUpActions}>
          {nextStep && onNext ? (
            <Button kind="accent" stretch iconAfter="arrowRight" label={t("cook.timeUp.next", { n: nextStep })} onPress={onNext} />
          ) : null}
          <View style={styles.timerControls}>
            <View style={{ flex: 1 }}>
              <Button kind="secondary" stretch icon="plus" label={t("cook.timer.more")} accessibilityHint={t("cook.timer.moreLabel")} onPress={onMore} />
            </View>
            <View style={{ flex: 1 }}>
              <Button kind={nextStep && onNext ? "secondary" : "accent"} stretch icon="check" label={t("cook.timeUp.gotIt")} onPress={onDismiss} />
            </View>
          </View>
        </View>
      </View>
    </Enter>
  );
}

/** "Need a hand?": quick questions, and the companion's last answer in a speech bubble. */
export function HandCard({
  listening,
  reply,
  onHeat,
  onNext,
  onAsk,
  onChanged,
}: {
  listening: boolean;
  reply: string;
  onHeat: () => void;
  onNext: () => void;
  onAsk: () => void;
  onChanged: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.surfaceMuted }]}>
      <View style={styles.timerHead}>
        <View style={styles.label}>
          <View style={[styles.bulb, { backgroundColor: colors.primary }]}>
            <Icon name="sparkle" size={18} color={colors.onPrimary} />
          </View>
          <Text variant="subheading">{t("cook.hand.title")}</Text>
        </View>
        {listening ? (
          <View style={styles.badgeRow}>
            <Pulse color={colors.primary} />
            <Text variant="caption" weight={600} color={colors.primaryText}>
              {t("cook.hand.listening")}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={styles.chips}>
        <Chip icon="flame" label={t("cook.hand.heat")} onPress={onHeat} />
        <Chip icon="forward" label={t("cook.hand.next")} onPress={onNext} />
        <Chip icon="mic" label={t("cook.hand.ask")} onPress={onAsk} />
        <Chip icon="edit" label={t("cook.hand.changed")} onPress={onChanged} />
      </View>
      <View style={[styles.bubble, { backgroundColor: colors.surface }]}>
        <Icon name="speaker" size={20} color={colors.accentText} />
        <Text style={{ flex: 1 }} accessibilityLiveRegion="polite">
          {reply}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  meta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md },
  pill: { borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 6 },
  heat: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 6 },
  segments: { flexDirection: "row", gap: 6 },
  segment: { flex: 1, height: 6, borderRadius: 3, overflow: "hidden" },
  segmentFill: { height: 6, borderRadius: 3 },
  photo: { height: 188, borderRadius: radius.card, overflow: "hidden" },
  photoImage: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%" },
  photoTag: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 6, backgroundColor: "rgba(28,28,24,0.62)", maxWidth: "70%" },
  photoTop: { position: "absolute", top: space.md, left: space.md },
  photoBottom: { position: "absolute", left: space.md, right: space.md, bottom: space.md, flexDirection: "row", justifyContent: "space-between", gap: space.sm },
  card: { borderRadius: radius.cardLg, padding: space.xl, gap: space.lg },
  label: { flexDirection: "row", alignItems: "center", gap: space.sm },
  cues: { borderRadius: radius.card, padding: space.lg, gap: space.md },
  cueHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  bulb: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  cueRow: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  avoid: { flexDirection: "row", alignItems: "flex-start", gap: space.md, borderRadius: radius.item, padding: space.md },
  timerHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  timerBody: { alignItems: "center" },
  ring: { width: RING, height: RING, alignItems: "center", justifyContent: "center" },
  clock: { fontVariant: ["tabular-nums"] },
  timerControls: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md },
  play: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  timeUp: { gap: space.md },
  timeUpActions: { gap: space.md },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  bubble: { flexDirection: "row", alignItems: "flex-start", gap: space.md, borderRadius: radius.card, padding: space.lg },
});
