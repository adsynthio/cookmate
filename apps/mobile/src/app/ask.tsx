// "Ask Cookmate anything": a short chat about this kitchen. Answers can carry recipes to open, things to add to the
// list and follow-up questions to tap. Opened from the sparkle on every screen's header and on Home's hero.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppHeader } from "@/components/AppHeader";
import { Icon } from "@/design-system/icons";
import { Enter, PressableScale, Pulse } from "@/design-system/motion";
import { Button, Chip, Text, textStyle } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { radius, shadow, space } from "@/design-system/tokens";
import { LANGUAGE_CODES } from "@/domain/onboarding";
import { getLocale, t, useLocale } from "@/i18n";
import { services, type AskReply } from "@/services";
import { useSession } from "@/state/session";

type Message = { id: number; role: "user" | "assistant"; text: string; reply?: AskReply; added?: boolean };

export default function AskScreen() {
  useLocale();
  const router = useRouter();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const householdId = useSession((s) => s.householdId);
  const { q } = useLocalSearchParams<{ q?: string }>();
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const nextId = useRef(1);
  const scroll = useRef<{ scrollToEnd: (o?: { animated?: boolean }) => void }>(null);

  const ask = useMutation({
    mutationFn: (question: string) =>
      services.assistant.ask({
        householdId: householdId!,
        question,
        history: messages.slice(-6).map((m) => ({ role: m.role, text: m.text })),
        languageCode: LANGUAGE_CODES[getLocale()],
      }),
    onSuccess: (reply) => setMessages((m) => [...m, { id: nextId.current++, role: "assistant", text: reply.answer, reply }]),
    onError: () => setMessages((m) => [...m, { id: nextId.current++, role: "assistant", text: t("ask.error") }]),
  });
  const addToList = useMutation({
    mutationFn: ({ items }: { id: number; items: string[] }) => services.kitchen.addToList(householdId!, items.map((name) => ({ name, reason: "manual" as const }))),
    onSuccess: (_r, { id }) => {
      setMessages((m) => m.map((x) => (x.id === id ? { ...x, added: true } : x)));
      void qc.invalidateQueries({ queryKey: ["list", householdId] });
    },
  });

  const send = (text: string) => {
    const question = text.trim();
    if (!question || ask.isPending || !householdId) return;
    setMessages((m) => [...m, { id: nextId.current++, role: "user", text: question }]);
    setDraft("");
    ask.mutate(question);
  };

  // Asked from somewhere else (Home's search, a follow-up link): ask straight away.
  useEffect(() => {
    if (q) send(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  useEffect(() => {
    const id = setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(id);
  }, [messages.length, ask.isPending]);

  const suggestions = [t("ask.s.make"), t("ask.s.soon"), t("ask.s.leftovers"), t("ask.s.guests")];

  return (
    <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: colors.canvas }}>
      <AppHeader title={t("ask.title")} back mic={false} ask={false} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView ref={scroll as never} contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
          {!messages.length ? (
            <Enter style={{ gap: space.lg }}>
              <View style={[styles.intro, { backgroundColor: colors.primary }]}>
                <View style={[styles.spark, { backgroundColor: "rgba(255,255,255,0.18)" }]}>
                  <Icon name="sparkle" size={22} color={colors.onPrimary} />
                </View>
                <Text variant="heading" color={colors.onPrimary}>
                  {t("ask.introTitle")}
                </Text>
                <Text color={colors.onPrimary} style={{ opacity: 0.9 }}>
                  {t("ask.introBody")}
                </Text>
              </View>
              <View style={{ gap: space.sm }}>
                {suggestions.map((s, i) => (
                  <Enter key={s} index={i}>
                    <PressableScale accessibilityRole="button" accessibilityLabel={s} onPress={() => send(s)} style={[styles.suggestion, shadow.card, { backgroundColor: colors.surface }]}>
                      <Icon name="sparkle" size={16} color={colors.accentText} />
                      <Text style={{ flex: 1 }}>{s}</Text>
                      <Icon name="forward" size={14} color={colors.inkSecondary} />
                    </PressableScale>
                  </Enter>
                ))}
              </View>
            </Enter>
          ) : null}

          {messages.map((m) =>
            m.role === "user" ? (
              <Enter key={m.id} style={styles.userRow}>
                <View style={[styles.bubble, styles.userBubble, { backgroundColor: colors.primary }]}>
                  <Text color={colors.onPrimary}>{m.text}</Text>
                </View>
              </Enter>
            ) : (
              <Enter key={m.id} style={{ gap: space.sm }}>
                <View style={[styles.bubble, styles.botBubble, shadow.card, { backgroundColor: colors.surface }]}>
                  <Text>{m.text}</Text>
                </View>
                {m.reply?.recipes.length ? (
                  <View style={styles.chips}>
                    {m.reply.recipes.map((r) => (
                      <Chip key={r.slug} icon="skillet" solid label={r.title} onPress={() => router.push(`/recipe/${r.slug}`)} />
                    ))}
                  </View>
                ) : null}
                {m.reply?.addToList.length ? (
                  <View style={{ alignSelf: "flex-start" }}>
                    <Button
                      kind="secondary"
                      size="small"
                      icon="cart"
                      label={m.added ? t("ask.added") : t("ask.addToList", { items: m.reply.addToList.join(", ") })}
                      disabled={m.added || addToList.isPending}
                      onPress={() => addToList.mutate({ id: m.id, items: m.reply!.addToList })}
                    />
                  </View>
                ) : null}
                {m.reply?.followUps.length && m.id === messages.at(-1)?.id ? (
                  <View style={styles.chips}>
                    {m.reply.followUps.map((f) => (
                      <Chip key={f} label={f} onPress={() => send(f)} />
                    ))}
                  </View>
                ) : null}
              </Enter>
            ),
          )}

          {ask.isPending ? (
            <View style={[styles.bubble, styles.botBubble, styles.thinking, { backgroundColor: colors.surface }]} accessibilityLabel={t("ask.thinking")}>
              <Pulse color={colors.primary} />
              <Text variant="label" muted>
                {t("ask.thinking")}
              </Text>
            </View>
          ) : null}
        </ScrollView>

        <View style={[styles.inputBar, { backgroundColor: colors.canvas, borderTopColor: colors.line }]}>
          <View style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={() => send(draft)}
              returnKeyType="send"
              placeholder={t("ask.placeholder")}
              placeholderTextColor={colors.inkTertiary}
              accessibilityLabel={t("ask.placeholder")}
              style={[textStyle("body"), { flex: 1, color: colors.ink, paddingVertical: 0 }]}
            />
          </View>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={t("ask.send")}
            onPress={() => send(draft)}
            disabled={!draft.trim() || ask.isPending}
            style={[styles.send, { backgroundColor: draft.trim() ? colors.accent : colors.surfaceHigh }]}
          >
            <Icon name="arrowRight" size={20} color={draft.trim() ? colors.onAccent : colors.inkSecondary} />
          </PressableScale>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  list: { padding: space.gutter, gap: space.md, paddingBottom: space.xl },
  intro: { borderRadius: radius.cardLg, padding: space.lg, gap: space.sm },
  spark: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", marginBottom: space.xs },
  suggestion: { flexDirection: "row", alignItems: "center", gap: space.md, borderRadius: radius.card, padding: space.md },
  userRow: { alignItems: "flex-end" },
  bubble: { maxWidth: "88%", borderRadius: 20, paddingHorizontal: space.lg, paddingVertical: space.md },
  userBubble: { borderBottomRightRadius: 6 },
  botBubble: { alignSelf: "flex-start", borderBottomLeftRadius: 6 },
  thinking: { flexDirection: "row", alignItems: "center", gap: space.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  inputBar: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.gutter, paddingVertical: space.sm, borderTopWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, flexDirection: "row", alignItems: "center", borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: space.lg, height: 48 },
  send: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
});
