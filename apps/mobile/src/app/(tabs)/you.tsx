// You: "What I've learned" with Edit · Keep · Forget (KIT-102, LRN-05). Every memory shows where it came from
// (LRN-02). Edit replaces our wording with the user's own; Forget asks once more before it goes.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";

import { Button, Card, Field, Screen, StateView, Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { radius, space } from "@/design-system/tokens";
import { t, useLocale, type StringKey } from "@/i18n";
import { services, type Memory } from "@/services";
import { useSession } from "@/state/session";

export default function YouScreen() {
  useLocale();
  const householdId = useSession((s) => s.householdId);
  const qc = useQueryClient();
  const memories = useQuery({
    queryKey: ["memories", householdId],
    queryFn: () => services.preference.listMemories(householdId!),
    enabled: !!householdId,
  });
  const { refetch } = memories;
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );
  const refresh = () => qc.invalidateQueries({ queryKey: ["memories", householdId] });

  return (
    <Screen>
      <Text variant="display" accessibilityRole="header">
        {t("you.title")}
      </Text>
      <View style={{ gap: space.xs }}>
        <Text variant="heading">{t("you.learned")}</Text>
        <Text muted>{t("you.learnedBody")}</Text>
      </View>
      {memories.isPending ? (
        <StateView state="loading" title={t("you.learned")} />
      ) : memories.isError ? (
        <StateView
          state="error"
          title={t("state.error.title")}
          body={t("state.error.body")}
          actionLabel={t("state.retry")}
          onAction={() => void memories.refetch()}
        />
      ) : memories.data.length === 0 ? (
        <StateView state="empty" title={t("you.empty")} />
      ) : (
        memories.data.map((m) => <MemoryCard key={m.id} memory={m} onChanged={refresh} />)
      )}
    </Screen>
  );
}

function MemoryCard({ memory, onChanged }: { memory: Memory; onChanged: () => void }) {
  const { colors } = useTheme();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(memory.statement);
  const [confirmForget, setConfirmForget] = useState(false);

  const keep = useMutation({ mutationFn: () => services.preference.keepMemory(memory.id) });
  const forget = useMutation({ mutationFn: () => services.preference.forgetMemory(memory.id), onSuccess: onChanged });
  const save = useMutation({
    mutationFn: () => services.preference.updateMemory(memory.id, text.trim()),
    onSuccess: () => {
      setEditing(false);
      onChanged();
    },
  });
  const failed = keep.isError || forget.isError || save.isError;

  return (
    <Card>
      {editing ? (
        <>
          <Field value={text} onChangeText={setText} accessibilityLabel={t("you.editLabel")} autoFocus maxLength={200} multiline />
          <View style={styles.actions}>
            <Button label={save.isPending ? t("finish.saving") : t("you.save")} disabled={save.isPending || text.trim().length < 2} onPress={() => save.mutate()} />
            <Button
              label={t("you.cancel")}
              kind="quiet"
              onPress={() => {
                setText(memory.statement);
                setEditing(false);
              }}
            />
          </View>
        </>
      ) : (
        <>
          <Text variant="heading">{memory.statement}</Text>
          <View style={styles.meta}>
            <Text variant="caption" muted>
              {[t(`you.source.${memory.source}` as StringKey), memory.memberName].filter(Boolean).join(" · ")}
            </Text>
            {memory.scope === "temporary" ? (
              <View style={[styles.tag, { backgroundColor: colors.amberSoft }]}>
                <Text variant="caption">{t("you.temporary")}</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.actions}>
            <Button label={t("you.edit")} kind="secondary" onPress={() => setEditing(true)} />
            <Button label={keep.isSuccess ? t("you.kept") : t("you.keep")} kind="secondary" disabled={keep.isPending || keep.isSuccess} onPress={() => keep.mutate()} />
            <Button
              label={confirmForget ? t("you.forgetSure") : t("you.forget")}
              kind="quiet"
              textColor={confirmForget ? colors.alert : undefined}
              disabled={forget.isPending}
              onPress={() => (confirmForget ? forget.mutate() : setConfirmForget(true))}
            />
          </View>
        </>
      )}
      {failed ? (
        <Text variant="caption" color={colors.alert} accessibilityLiveRegion="polite">
          {t("state.error.body")}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  meta: { flexDirection: "row", alignItems: "center", gap: space.sm },
  tag: { borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 2 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.sm },
});
