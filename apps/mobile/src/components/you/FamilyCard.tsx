// Q5: the family after setup. Onboarding says "you can change this later" and "set each person on the You tab";
// this is that place. Add a person (up to 12: joint families), change anyone's name, age group, diet or spice, and
// remove someone without an account of their own (their past reactions and memories stay). Picks follow on the
// next visit to Home.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { Icon } from "@/design-system/icons";
import { Enter, PressableScale } from "@/design-system/motion";
import { Button, Card, Chip, Field, IconButton, SectionHeader, Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { radius, space } from "@/design-system/tokens";
import { MAX_MEMBERS, MAX_NAME_LENGTH } from "@/domain/onboarding";
import type { AgeGroup, Diet } from "@/domain/ranking";
import { t, type StringKey } from "@/i18n";
import { services, type Member, type MemberChanges } from "@/services";

const AGE_GROUPS: AgeGroup[] = ["adult", "child", "teen", "elder"];
const DIETS: Diet[] = ["veg", "eggetarian", "nonveg", "jain", "vegan"];
const SPICES = [1, 2, 3, 4, 5] as const;

type Draft = { displayName: string; ageGroup: AgeGroup; diet: Diet; spice: number };

/** The plain reason a change didn't save, from the server's words. */
function problemText(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  if (/up to 12/.test(msg)) return t("you.family.full", { max: MAX_MEMBERS });
  if (/owner|own phone|42501/.test(msg)) return t("you.family.ownerOnly");
  if (/1 to 40/.test(msg)) return t("you.family.nameNeeded");
  return t("you.family.error");
}

export function FamilyCard({ householdId, members, selfId }: { householdId: string; members: Member[]; selfId: string | null }) {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);
  const me = members.find((m) => m.id === selfId);
  // A new person starts with the household's way of eating; children start mild.
  const fresh: Draft = { displayName: "", ageGroup: "adult", diet: me?.diet ?? members[0]?.diet ?? "veg", spice: me?.spice ?? 3 };
  const changed = () => {
    setEditing(null);
    void qc.invalidateQueries({ queryKey: ["members", householdId] });
    // Who eats here changed: Home asks for new picks the next time it opens, not now (each ask costs credits).
    void qc.invalidateQueries({ queryKey: ["picks"], refetchType: "none" });
  };

  return (
    <View style={{ gap: space.sm }}>
      <SectionHeader title={t("you.family.title")} note={t("you.family.count", { n: members.length, max: MAX_MEMBERS })} />
      {members.map((m, i) =>
        editing === m.id ? (
          <PersonEditor
            key={m.id}
            householdId={householdId}
            member={m}
            start={{ displayName: m.displayName, ageGroup: m.ageGroup, diet: m.diet, spice: m.spice }}
            onDone={changed}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <Enter key={m.id} index={i}>
            <Card>
              <View style={styles.row}>
                <View style={[styles.avatar, { backgroundColor: m.id === selfId ? colors.primarySoft : colors.peach }]}>
                  <Text variant="bodyStrong" color={m.id === selfId ? colors.primaryText : colors.peachText}>
                    {(m.displayName.trim()[0] ?? "?").toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="bodyStrong">{m.id === selfId ? t("you.family.you", { name: m.displayName }) : m.displayName}</Text>
                  <Text variant="caption" muted>
                    {[t(`age.${m.ageGroup}` as StringKey), t(`diet.${m.diet}` as StringKey), t(`spice.${m.spice}` as StringKey)].join(" · ")}
                  </Text>
                </View>
                <IconButton label={t("you.family.change", { name: m.displayName })} muted size={48} onPress={() => setEditing(m.id)}>
                  <Icon name="edit" size={20} />
                </IconButton>
              </View>
            </Card>
          </Enter>
        ),
      )}
      {editing === "new" ? (
        <PersonEditor householdId={householdId} start={fresh} onDone={changed} onCancel={() => setEditing(null)} />
      ) : members.length < MAX_MEMBERS ? (
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={t("you.family.add")}
          onPress={() => setEditing("new")}
          style={[styles.add, { borderColor: colors.primary }]}
        >
          <Icon name="plus" size={20} color={colors.primaryText} />
          <Text variant="label" weight={600} color={colors.primaryText}>
            {t("you.family.add")}
          </Text>
        </PressableScale>
      ) : (
        <Text variant="caption" muted>
          {t("you.family.full", { max: MAX_MEMBERS })}
        </Text>
      )}
      {members.some((m) => m.diet === "nonveg" || m.diet === "eggetarian") ? <MeatlessDays householdId={householdId} /> : null}
    </View>
  );
}

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

/** Q6: weekdays the family eats no meat, fish or egg (Tuesday for many). Picks and chosen dishes are veg then. */
function MeatlessDays({ householdId }: { householdId: string }) {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const days = useQuery({ queryKey: ["meatless", householdId], queryFn: () => services.preference.getMeatlessDays(householdId) });
  const save = useMutation({
    mutationFn: (next: number[]) => services.preference.setMeatlessDays(householdId, next),
    onMutate: (next) => qc.setQueryData(["meatless", householdId], next),
    onError: () => void qc.invalidateQueries({ queryKey: ["meatless", householdId] }),
    // Today's picks may change: Home asks again the next time it opens.
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["picks"], refetchType: "none" }),
  });
  const chosen = days.data ?? [];
  const toggle = (d: number) => save.mutate(chosen.includes(d) ? chosen.filter((x) => x !== d) : [...chosen, d].sort());

  return (
    <Card>
      <Text variant="bodyStrong">{t("you.family.meatless")}</Text>
      <View style={styles.chips}>
        {WEEKDAYS.map((d) => (
          <Chip key={d} label={t(`day.${d}` as StringKey)} selected={chosen.includes(d)} showCheck onPress={() => toggle(d)} />
        ))}
      </View>
      <Text variant="caption" muted>
        {t("you.family.meatlessNote")}
      </Text>
      {save.isError ? (
        <Text color={colors.alert} accessibilityLiveRegion="polite">
          {problemText(save.error)}
        </Text>
      ) : null}
    </Card>
  );
}

function PersonEditor({
  householdId,
  member,
  start,
  onDone,
  onCancel,
}: {
  householdId: string;
  /** Absent when adding someone new. */
  member?: Member;
  start: Draft;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { colors } = useTheme();
  const [draft, setDraft] = useState<Draft>(start);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const name = draft.displayName.trim();

  const save = useMutation({
    mutationFn: async () => {
      if (!member) {
        await services.preference.addMember({
          householdId,
          member: { displayName: name, ageGroup: draft.ageGroup, diet: draft.diet, spice: draft.spice as 1 | 2 | 3 | 4 | 5 },
        });
        return;
      }
      const changes: MemberChanges = {};
      if (name !== member.displayName) changes.displayName = name;
      if (draft.ageGroup !== member.ageGroup) changes.ageGroup = draft.ageGroup;
      if (draft.diet !== member.diet) changes.diet = draft.diet;
      if (draft.spice !== member.spice) changes.spice = draft.spice;
      if (Object.keys(changes).length) await services.preference.updateMember({ memberId: member.id, changes });
    },
    onSuccess: onDone,
  });
  const remove = useMutation({ mutationFn: () => services.preference.removeMember(member!.id), onSuccess: onDone });
  const busy = save.isPending || remove.isPending;
  const failed = save.error ?? remove.error;

  return (
    <Card>
      <Text variant="overline" muted>
        {member ? t("you.family.changing", { name: member.displayName }) : t("you.family.add")}
      </Text>
      <Field
        value={draft.displayName}
        onChangeText={(v) => set({ displayName: v })}
        placeholder={t("onb.members.name")}
        accessibilityLabel={t("onb.members.name")}
        maxLength={MAX_NAME_LENGTH}
        autoCapitalize="words"
        autoFocus={!member}
        returnKeyType="done"
        variant="bodyStrong"
      />
      <Text variant="label" muted>
        {t("you.family.age")}
      </Text>
      <View style={styles.chips} accessibilityRole="radiogroup">
        {AGE_GROUPS.map((a) => (
          // Children start mild, as in setup.
          <Chip key={a} label={t(`age.${a}` as StringKey)} selected={draft.ageGroup === a} onPress={() => set({ ageGroup: a, ...(!member && a === "child" ? { spice: Math.min(draft.spice, 2) } : {}) })} />
        ))}
      </View>
      <Text variant="label" muted>
        {t("you.family.diet")}
      </Text>
      <View style={styles.chips} accessibilityRole="radiogroup">
        {DIETS.map((d) => (
          <Chip key={d} label={t(`diet.${d}` as StringKey)} selected={draft.diet === d} onPress={() => set({ diet: d })} />
        ))}
      </View>
      <Text variant="label" muted>
        {t("you.family.spice")}
      </Text>
      <View style={styles.chips} accessibilityRole="radiogroup">
        {SPICES.map((s) => (
          <Chip key={s} label={t(`spice.${s}` as StringKey)} selected={draft.spice === s} onPress={() => set({ spice: s })} />
        ))}
      </View>
      {failed ? (
        <Text color={colors.alert} accessibilityLiveRegion="polite">
          {problemText(failed)}
        </Text>
      ) : null}
      {confirmRemove && member ? (
        <View style={{ gap: space.sm }}>
          <Text variant="bodyStrong">{t("you.family.removeConfirm", { name: member.displayName })}</Text>
          <View style={styles.actions}>
            <Button label={remove.isPending ? t("finish.saving") : t("you.family.remove")} kind="accent" disabled={busy} onPress={() => remove.mutate()} />
            <Button label={t("you.cancel")} kind="quiet" onPress={() => setConfirmRemove(false)} />
          </View>
        </View>
      ) : (
        <View style={styles.actions}>
          <Button label={save.isPending ? t("finish.saving") : t("you.save")} disabled={busy || !name} onPress={() => save.mutate()} />
          <Button label={t("you.cancel")} kind="quiet" onPress={onCancel} />
          {member && !member.hasAccount ? (
            <Button label={t("you.family.remove")} kind="quiet" icon="trash" onPress={() => setConfirmRemove(true)} />
          ) : null}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.md },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, alignItems: "center" },
  add: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    borderWidth: 2,
    borderStyle: "dashed",
    borderRadius: radius.item,
  },
});
