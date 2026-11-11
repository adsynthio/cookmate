// Ask a question, or say you did something differently, without losing your place (KIT-074, KIT-075).
// ?mode=ask | changed. An answer comes with the step's own safety note word for word; a change is recorded on the
// session and may leave short reminders on the steps still ahead.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { Icon } from "@/design-system/icons";
import { Button, Card, Field, IconButton, Screen, StateView, Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { radius, space } from "@/design-system/tokens";
import { fallbackAnswer, MAX_QUESTION_CHARS, type Answer, type ChangeResult } from "@/domain/assist";
import { LANGUAGE_CODES } from "@/domain/onboarding";
import { getLocale, t, useLocale } from "@/i18n";
import { services } from "@/services";
import { hush, say } from "@/services/feedback";

type Outcome = ({ kind: "answer" } & Answer & { offline?: boolean }) | ({ kind: "change" } & ChangeResult);

export default function AssistScreen() {
  useLocale();
  const { colors } = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const locale = getLocale();
  const { id, mode } = useLocalSearchParams<{ id: string; mode?: string }>();
  const changed = mode === "changed";
  const [text, setText] = useState("");
  useEffect(() => hush, []);

  const session = useQuery({ queryKey: ["cook", id], queryFn: () => services.cooking.getSession(id!), enabled: !!id, staleTime: 0 });
  const recipeId = session.data?.recipeId;
  const recipe = useQuery({ queryKey: ["recipe", recipeId], queryFn: () => services.recipe.getRecipe(recipeId!), enabled: !!recipeId });

  const send = useMutation({
    mutationFn: async (): Promise<Outcome> => {
      const languageCode = LANGUAGE_CODES[locale];
      if (changed) return { kind: "change", ...(await services.cooking.reportChange({ sessionId: id!, change: text.trim(), languageCode })) };
      try {
        return { kind: "answer", ...(await services.cooking.ask({ sessionId: id!, question: text.trim(), languageCode })) };
      } catch (err) {
        // No network at the stove: fall back to what the step itself says.
        const step = recipe.data?.steps[(session.data?.currentStep ?? 1) - 1];
        if (!step) throw err;
        return { kind: "answer", ...fallbackAnswer(step, text, locale), offline: true };
      }
    },
    onSuccess: (r) => {
      if (r.kind === "change") void queryClient.invalidateQueries({ queryKey: ["cook", id] });
    },
  });

  const r = send.data;
  return (
    <Screen>
      <View style={styles.top}>
        <IconButton label={t("rescue.close")} onPress={() => router.back()}>
          <Icon name="close" />
        </IconButton>
      </View>

      {session.isPending || recipe.isPending ? (
        <StateView state="loading" title={t("assist.thinking")} />
      ) : session.isError || recipe.isError ? (
        <StateView
          state="error"
          title={t("cook.notFound")}
          body={t("state.error.body")}
          actionLabel={t("state.retry")}
          onAction={() => void (session.isError ? session.refetch() : recipe.refetch())}
        />
      ) : send.isPending ? (
        <StateView state="loading" title={t("assist.thinking")} />
      ) : r ? (
        <>
          {r.kind === "answer" && r.safetyNote ? (
            <View style={[styles.note, { backgroundColor: colors.alertSoft }]} accessibilityRole="alert">
              <Text variant="bodyStrong" color={colors.alert}>
                {t("recipe.safety")}
              </Text>
              <Text color={colors.alert}>{r.safetyNote}</Text>
            </View>
          ) : null}
          <Card>
            <Text variant="heading" accessibilityLiveRegion="polite">
              {r.kind === "answer" ? r.answer : r.reply}
            </Text>
          </Card>
          {r.kind === "change"
            ? r.notes.map((n) => (
                <Card key={n.step}>
                  <Text variant="label" muted>
                    {t("assist.noteFor", { n: n.step })}
                  </Text>
                  <Text variant="bodyStrong">{n.note}</Text>
                </Card>
              ))
            : null}
          {r.kind === "answer" && r.offline ? (
            <Text variant="caption" muted>
              {t("assist.offline")}
            </Text>
          ) : null}
          <Text variant="caption" muted>
            {t("assist.step", { n: session.data.currentStep })}
          </Text>
          <Button
            kind="secondary"
            label={t("rescue.read")}
            onPress={() => say(r.kind === "answer" ? [r.safetyNote, r.answer].filter(Boolean).join(" ") : [r.reply, ...r.notes.map((n) => n.note)].join(" "))}
          />
          <Button size="cook" label={t("rescue.back")} onPress={() => router.back()} />
          {r.kind === "answer" ? (
            <Button
              kind="quiet"
              label={t("assist.another")}
              onPress={() => {
                hush();
                setText("");
                send.reset();
              }}
            />
          ) : null}
        </>
      ) : (
        <>
          <Text variant="title" accessibilityRole="header">
            {changed ? t("assist.changed.title") : t("assist.ask.title")}
          </Text>
          <Field
            value={text}
            onChangeText={setText}
            placeholder={changed ? t("assist.changed.hint") : t("assist.ask.hint")}
            accessibilityLabel={changed ? t("assist.changed.title") : t("assist.ask.title")}
            autoFocus
            multiline
            maxLength={MAX_QUESTION_CHARS}
            style={styles.input}
          />
          {send.isError ? (
            <Text color={colors.alert} accessibilityLiveRegion="polite">
              {t("state.error.body")}
            </Text>
          ) : null}
          <Button
            size="cook"
            label={changed ? t("assist.changed.send") : t("assist.ask.send")}
            disabled={text.trim().length < 2}
            onPress={() => send.mutate()}
          />
          <Text variant="caption" muted>
            {t("assist.step", { n: session.data.currentStep })}
          </Text>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row" },
  note: { borderRadius: radius.card, padding: space.lg, gap: space.xs },
  input: { minHeight: 96, textAlignVertical: "top" },
});
