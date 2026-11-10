// You: "What I've learned" with Edit · Keep · Forget (LRN-05). Every memory shows its source (LRN-02).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { View } from "react-native";

import { Button, Card, Screen, StateView, Text } from "@/design-system/primitives";
import { space } from "@/design-system/tokens";
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
  const forget = useMutation({
    mutationFn: (id: string) => services.preference.forgetMemory(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["memories", householdId] }),
  });
  const keep = useMutation({ mutationFn: (id: string) => services.preference.keepMemory(id) });

  return (
    <Screen>
      <Text variant="display">{t("you.title")}</Text>
      <Text variant="heading">{t("you.learned")}</Text>
      {memories.isPending ? (
        <StateView state="loading" title="…" />
      ) : memories.isError ? (
        <StateView state="error" title={t("state.error.title")} actionLabel={t("state.retry")} onAction={() => memories.refetch()} />
      ) : (
        memories.data.map((m) => (
          <MemoryCard key={m.id} memory={m} onKeep={() => keep.mutate(m.id)} onForget={() => forget.mutate(m.id)} />
        ))
      )}
    </Screen>
  );
}

function MemoryCard({ memory, onKeep, onForget }: { memory: Memory; onKeep: () => void; onForget: () => void }) {
  return (
    <Card>
      <Text variant="heading">{memory.statement}</Text>
      <Text variant="caption" muted>
        {t(`you.source.${memory.source}` as StringKey)}
        {memory.memberName ? ` · ${memory.memberName}` : ""}
      </Text>
      <View style={{ flexDirection: "row", gap: space.sm, marginTop: space.sm }}>
        <Button label={t("you.keep")} kind="secondary" onPress={onKeep} />
        <Button label={t("you.forget")} kind="quiet" onPress={onForget} />
      </View>
    </Card>
  );
}
