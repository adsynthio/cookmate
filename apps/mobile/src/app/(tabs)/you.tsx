// You: what Cookmate knows about this household, all of it editable (KIT-102, KIT-105, KIT-055, LRN-05).
// * Tell me something: a short note in any of the three languages. "Agli baar lahsun zyada" changes amounts in
//   recipes from now on, "Riya ko karela pasand nahi" becomes Riya's dislike; anything else is kept as said.
// * Likes and dislikes per person: picks leave out what anyone eating avoids and favour what they love.
// * Saved dishes (favourites), and What I've learned with Edit · Keep · Forget (Forget asks once more).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { catalogEntry } from "@/data/catalog";
import { Icon } from "@/design-system/icons";
import { Button, Card, Chip, Field, Screen, StateView, Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { radius, space } from "@/design-system/tokens";
import { displayName } from "@/domain/kitchen";
import { parseNote, preferenceStatement } from "@/domain/learning";
import { indianMobile, maskPhone, PACES, SKILLS, stepWords, UNITS, VERBOSITIES, type VoiceProfile } from "@/domain/voiceStyle";
import { useVoiceProfile } from "@/components/voice/useVoiceProfile";
import { say } from "@/services/feedback";
import { recipeTitle } from "@/domain/recipes";
import { getLocale, t, useLocale, type StringKey } from "@/i18n";
import { services, type Member, type Memory, type NewMemory } from "@/services";
import { findIngredients } from "@/services/picks";
import { useSession } from "@/state/session";

/** A plain like or dislike of an ingredient, shown under Likes and dislikes rather than in the general list. */
export function isPreference(m: Memory): boolean {
  return !!m.ingredientKey && m.recipeId === null && m.polarity !== 0 && (m.about ?? "preference") === "preference";
}

export default function YouScreen() {
  useLocale();
  const householdId = useSession((s) => s.householdId);
  const memberId = useSession((s) => s.memberId);
  const qc = useQueryClient();
  const memories = useQuery({
    queryKey: ["memories", householdId],
    queryFn: () => services.preference.listMemories(householdId!),
    enabled: !!householdId,
  });
  const members = useQuery({
    queryKey: ["members", householdId],
    queryFn: () => services.preference.listMembers(householdId!),
    enabled: !!householdId,
  });
  const favourites = useQuery({
    queryKey: ["favourites", householdId],
    queryFn: () => services.recipe.listFavourites(householdId!),
    enabled: !!householdId,
  });
  const { refetch } = memories;
  const refetchFavourites = favourites.refetch;
  useFocusEffect(
    useCallback(() => {
      void refetch();
      void refetchFavourites();
    }, [refetch, refetchFavourites]),
  );
  const refresh = () => qc.invalidateQueries({ queryKey: ["memories", householdId] });
  const save = (input: Omit<NewMemory, "householdId">) => services.preference.saveMemory({ householdId: householdId!, ...input });
  const general = (memories.data ?? []).filter((m) => !isPreference(m));

  return (
    <Screen>
      <Text variant="display" accessibilityRole="header">
        {t("you.title")}
      </Text>

      {householdId ? <TellMe members={members.data ?? []} selfId={memberId} onSave={save} onSaved={refresh} /> : null}

      <View style={{ gap: space.xs }}>
        <Text variant="heading">{t("you.prefs")}</Text>
        <Text muted>{t("you.prefsBody")}</Text>
      </View>
      {members.data && memories.data ? (
        <Preferences members={members.data} memories={memories.data.filter(isPreference)} onSave={save} onChanged={refresh} />
      ) : null}

      <View style={{ gap: space.xs }}>
        <Text variant="heading">{t("you.saved")}</Text>
      </View>
      <SavedDishes dishes={favourites.data} />

      <VoiceSettings />
      <PhoneLink />

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
      ) : general.length === 0 ? (
        <StateView state="empty" title={t("you.empty")} />
      ) : (
        general.map((m) => <MemoryCard key={m.id} memory={m} onChanged={refresh} />)
      )}
    </Screen>
  );
}

const ingredientName = (key: string) => displayName(catalogEntry(key), key, getLocale());

/** "Tell me something": a note in the cook's own words, read with rules (never sent to a model from here). */
function TellMe({
  members,
  selfId,
  onSave,
  onSaved,
}: {
  members: Member[];
  selfId: string | null;
  onSave: (input: Omit<NewMemory, "householdId">) => Promise<string>;
  onSaved: () => void;
}) {
  const { colors } = useTheme();
  const [text, setText] = useState("");
  const [understood, setUnderstood] = useState<string | null>(null);
  const tell = useMutation({
    mutationFn: async (note: string) => {
      const parsed = parseNote(note, findIngredients, members.map((m) => ({ id: m.id, name: m.displayName })));
      const memberId = parsed.memberId ?? selfId ?? undefined;
      if (parsed.kind === "amount") {
        await onSave({ memberId, statement: note, category: "ingredient", about: "amount", amount: parsed.amount, ingredientKey: parsed.ingredientKey, polarity: 0 });
        return t(parsed.amount === "more" ? "you.tell.more" : "you.tell.less", { item: ingredientName(parsed.ingredientKey) });
      }
      if (parsed.kind === "preference") {
        await onSave({ memberId, statement: note, category: "ingredient", about: "preference", polarity: parsed.polarity, ingredientKey: parsed.ingredientKey });
        const name = members.find((m) => m.id === memberId)?.displayName ?? t("you.everyone");
        return preferenceStatement(name, ingredientName(parsed.ingredientKey), parsed.polarity, getLocale());
      }
      await onSave({ memberId: parsed.memberId, statement: note, category: "other" });
      return t("you.tell.plain");
    },
    onSuccess: (said) => {
      setUnderstood(said);
      setText("");
      onSaved();
    },
  });
  return (
    <Card tint={colors.limeSoft}>
      <Text variant="heading">{t("you.tell.title")}</Text>
      <Field
        value={text}
        onChangeText={(v) => {
          setText(v);
          setUnderstood(null);
        }}
        placeholder={t("you.tell.placeholder")}
        accessibilityLabel={t("you.tell.title")}
        maxLength={200}
      />
      <View style={styles.actions}>
        <Button label={tell.isPending ? t("finish.saving") : t("you.tell.save")} disabled={tell.isPending || text.trim().length < 3} onPress={() => tell.mutate(text.trim())} />
      </View>
      {understood ? (
        <Text variant="label" accessibilityLiveRegion="polite">
          {t("you.tell.got", { what: understood })}
        </Text>
      ) : null}
      {tell.isError ? (
        <Text variant="caption" color={colors.alert} accessibilityLiveRegion="polite">
          {t("state.error.body")}
        </Text>
      ) : null}
    </Card>
  );
}

/** Likes and dislikes per person (KIT-105). */
function Preferences({
  members,
  memories,
  onSave,
  onChanged,
}: {
  members: Member[];
  memories: Memory[];
  onSave: (input: Omit<NewMemory, "householdId">) => Promise<string>;
  onChanged: () => void;
}) {
  const { colors } = useTheme();
  const [who, setWho] = useState<string | null>(members[0]?.id ?? null);
  const [item, setItem] = useState("");
  const [unknown, setUnknown] = useState(false);
  const person = members.find((m) => m.id === who) ?? members[0];
  const add = useMutation({
    mutationFn: async (polarity: -1 | 1) => {
      const [key] = findIngredients(item);
      if (!key || !person) {
        setUnknown(true);
        return false;
      }
      await onSave({
        memberId: person.id,
        statement: preferenceStatement(person.displayName, ingredientName(key), polarity, getLocale()),
        category: "ingredient",
        about: "preference",
        polarity,
        ingredientKey: key,
      });
      return true;
    },
    onSuccess: (ok) => {
      if (!ok) return;
      setItem("");
      onChanged();
    },
  });
  const forget = useMutation({ mutationFn: (id: string) => services.preference.forgetMemory(id), onSuccess: onChanged });

  return (
    <Card>
      {members.map((m) => {
        const mine = memories.filter((x) => x.memberId === m.id);
        return mine.length ? (
          <View key={m.id} style={{ gap: space.xs }}>
            <Text variant="bodyStrong">{m.displayName}</Text>
            <View style={styles.chips}>
              {mine.map((x) => (
                <Pressable
                  key={x.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${x.statement}. ${t("you.prefRemove")}`}
                  onPress={() => forget.mutate(x.id)}
                  style={[styles.pref, { backgroundColor: x.polarity < 0 ? colors.alertSoft : colors.limeSoft }]}
                >
                  <Text variant="label">
                    {t(x.polarity < 0 ? "you.avoids" : "you.loves", { item: ingredientName(x.ingredientKey!) })}
                  </Text>
                  <Icon name="close" size={16} muted />
                </Pressable>
              ))}
            </View>
          </View>
        ) : null;
      })}
      {memories.filter((x) => x.memberId === null).length ? (
        <View style={{ gap: space.xs }}>
          <Text variant="bodyStrong">{t("you.everyone")}</Text>
          <View style={styles.chips}>
            {memories
              .filter((x) => x.memberId === null)
              .map((x) => (
                <Pressable
                  key={x.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${x.statement}. ${t("you.prefRemove")}`}
                  onPress={() => forget.mutate(x.id)}
                  style={[styles.pref, { backgroundColor: x.polarity < 0 ? colors.alertSoft : colors.limeSoft }]}
                >
                  <Text variant="label">{t(x.polarity < 0 ? "you.avoids" : "you.loves", { item: ingredientName(x.ingredientKey!) })}</Text>
                  <Icon name="close" size={16} muted />
                </Pressable>
              ))}
          </View>
        </View>
      ) : null}
      {memories.length === 0 ? <Text muted>{t("you.prefsEmpty")}</Text> : null}

      {members.length > 1 ? (
        <View style={styles.chips}>
          {members.map((m) => (
            <Chip key={m.id} label={m.displayName} selected={m.id === person?.id} onPress={() => setWho(m.id)} />
          ))}
        </View>
      ) : null}
      <Field
        value={item}
        onChangeText={(v) => {
          setItem(v);
          setUnknown(false);
        }}
        placeholder={t("you.prefPlaceholder")}
        accessibilityLabel={t("you.prefPlaceholder")}
        maxLength={60}
      />
      <View style={styles.actions}>
        <Button kind="secondary" label={t("you.addAvoid")} disabled={add.isPending || item.trim().length < 2} onPress={() => add.mutate(-1)} />
        <Button kind="secondary" label={t("you.addLove")} disabled={add.isPending || item.trim().length < 2} onPress={() => add.mutate(1)} />
      </View>
      {unknown ? (
        <Text variant="caption" color={colors.alert} accessibilityLiveRegion="polite">
          {t("you.prefUnknown", { item: item.trim() })}
        </Text>
      ) : null}
      {add.isError || forget.isError ? (
        <Text variant="caption" color={colors.alert} accessibilityLiveRegion="polite">
          {t("state.error.body")}
        </Text>
      ) : null}
    </Card>
  );
}

/** How Cookmate talks to you (KIT-068): pace, detail, experience and units, for voice and read-aloud. */
function VoiceSettings() {
  const qc = useQueryClient();
  const { profile, query, memberId } = useVoiceProfile();
  const save = useMutation({
    mutationFn: (changes: Partial<VoiceProfile>) => services.preference.updateVoiceProfile(memberId!, changes),
    onMutate: (changes) => qc.setQueryData(["voiceProfile", memberId], { ...profile, ...changes }),
    onError: () => void qc.invalidateQueries({ queryKey: ["voiceProfile", memberId] }),
  });
  if (!memberId || !query.data) return null;
  const row = <K extends keyof VoiceProfile>(key: K, values: VoiceProfile[K][], label: StringKey) => (
    <View style={{ gap: space.xs }}>
      <Text variant="label" muted>
        {t(label)}
      </Text>
      <View style={styles.chips}>
        {values.map((v) => (
          <Chip key={v} label={t(`you.voice.${key}.${v}` as StringKey)} selected={profile[key] === v} onPress={() => save.mutate({ [key]: v } as Partial<VoiceProfile>)} />
        ))}
      </View>
    </View>
  );
  return (
    <>
      <View style={{ gap: space.xs }}>
        <Text variant="heading">{t("you.voice.title")}</Text>
        <Text muted>{t("you.voice.body")}</Text>
      </View>
      <Card>
        {row("pace", PACES, "you.voice.paceLabel")}
        {row("verbosity", VERBOSITIES, "you.voice.verbosityLabel")}
        {row("skill", SKILLS, "you.voice.skillLabel")}
        {row("units", UNITS, "you.voice.unitsLabel")}
        <Button kind="secondary" label={t("you.voice.try")} onPress={() => say(stepWords(SAMPLE_STEP[getLocale()], profile))} />
      </Card>
    </>
  );
}

const SAMPLE_STEP: Record<"en" | "hi" | "hinglish", { text: string; cue: string; safety: string }> = {
  en: { text: "Heat the ghee and add cumin", cue: "Wait until the seeds crackle", safety: "Keep your face away from the pan" },
  hi: { text: "घी गरम करें और जीरा डालें", cue: "दाने चटकने तक रुकें", safety: "चेहरा कड़ाही से दूर रखें" },
  hinglish: { text: "Ghee garam karke jeera daalein", cue: "Daane chatakne tak rukein", safety: "Chehra kadhai se door rakhein" },
};

/** Keep your kitchen safe (KIT-021): link a phone to this anonymous account. Same account, so nothing moves. */
function PhoneLink() {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const phone = useQuery({ queryKey: ["phone"], queryFn: () => services.auth.getPhone() });
  const [number, setNumber] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [problem, setProblem] = useState<StringKey | null>(null);
  const send = useMutation({
    mutationFn: (e164: string) => services.auth.startPhoneLink(e164),
    onSuccess: (result, e164) => {
      if (result === "sent") {
        setSentTo(e164);
        setProblem(null);
      } else setProblem(result === "taken" ? "you.phone.taken" : "you.phone.notReady");
    },
    onError: () => setProblem("state.error.body"),
  });
  const verify = useMutation({
    mutationFn: () => services.auth.confirmPhoneLink(sentTo!, code.trim()),
    onSuccess: (ok) => {
      if (!ok) return setProblem("you.phone.wrongCode");
      setProblem(null);
      void qc.invalidateQueries({ queryKey: ["phone"] });
    },
    onError: () => setProblem("state.error.body"),
  });
  if (phone.isPending) return null;
  const e164 = indianMobile(number);
  return (
    <>
      <View style={{ gap: space.xs }}>
        <Text variant="heading">{t("you.phone.title")}</Text>
        <Text muted>{t("you.phone.body")}</Text>
      </View>
      <Card>
        {phone.data ? (
          <View style={styles.dish}>
            <Icon name="check" color={colors.limeText} />
            <Text variant="bodyStrong">{t("you.phone.linked", { phone: maskPhone(phone.data) })}</Text>
          </View>
        ) : sentTo ? (
          <>
            <Text>{t("you.phone.sent", { phone: maskPhone(sentTo) })}</Text>
            <Field value={code} onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))} placeholder="123456" keyboardType="number-pad" accessibilityLabel={t("you.phone.codeLabel")} maxLength={6} />
            <View style={styles.actions}>
              <Button label={verify.isPending ? t("finish.saving") : t("you.phone.verify")} disabled={verify.isPending || code.length !== 6} onPress={() => verify.mutate()} />
              <Button kind="quiet" label={t("you.phone.change")} onPress={() => { setSentTo(null); setCode(""); }} />
            </View>
          </>
        ) : (
          <>
            <Field value={number} onChangeText={setNumber} placeholder="98765 43210" keyboardType="phone-pad" accessibilityLabel={t("you.phone.numberLabel")} maxLength={16} />
            <View style={styles.actions}>
              <Button label={send.isPending ? t("finish.saving") : t("you.phone.send")} disabled={!e164 || send.isPending} onPress={() => e164 && send.mutate(e164)} />
            </View>
          </>
        )}
        {problem ? (
          <Text variant="caption" color={colors.alert} accessibilityLiveRegion="polite">
            {t(problem)}
          </Text>
        ) : null}
      </Card>
    </>
  );
}

/** Saved dishes (KIT-055): the heart on a recipe adds it here. */
function SavedDishes({ dishes }: { dishes: Awaited<ReturnType<typeof services.recipe.listFavourites>> | undefined }) {
  const router = useRouter();
  if (!dishes) return null;
  if (!dishes.length) return <Text muted>{t("you.savedEmpty")}</Text>;
  return (
    <Card>
      {dishes.map((d) => (
        <Pressable key={d.id} accessibilityRole="button" onPress={() => router.push(`/recipe/${d.id}`)} style={styles.dish}>
          <Icon name="heart" size={20} muted />
          <Text variant="bodyStrong" style={{ flex: 1 }}>
            {recipeTitle(d, getLocale())}
          </Text>
          {d.totalTimeMin ? (
            <Text variant="label" muted>
              {t("home.minutes", { min: d.totalTimeMin })}
            </Text>
          ) : null}
          <Icon name="forward" size={20} muted />
        </Pressable>
      ))}
    </Card>
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
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  pref: { flexDirection: "row", alignItems: "center", gap: space.xs, borderRadius: radius.pill, paddingHorizontal: space.md, minHeight: 40 },
  dish: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 56 },
});
