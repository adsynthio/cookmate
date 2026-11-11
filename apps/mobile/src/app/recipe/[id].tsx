// Recipe detail (KIT-050): what you have and what's missing ("You have 9 of 10", from confident items and
// staples only), substitutes from your own kitchen, Add to list, quantities scaled to who's eating in katori /
// pieces where we know the measure, Why this works (KIT-053), family plates naming who each branch is for (KIT-052)
// and the steps with cues and safety notes.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Image, StyleSheet, View } from "react-native";

import { catalogEntry } from "@/data/catalog";
import { rememberedAmount, useAmountChanges } from "@/components/recipe/amount";
import type { AmountChange } from "@/domain/learning";
import { Icon } from "@/design-system/icons";
import { dishImage } from "@/design-system/media";
import { Button, Card, IconButton, Screen, StateView, Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { radius, space } from "@/design-system/tokens";
import { displayName } from "@/domain/kitchen";
import { LANGUAGE_CODES } from "@/domain/onboarding";
import { pantryMatch, type IngredientMatch } from "@/domain/ranking";
import {
  familyBranches,
  recipeTitle,
  toRankRecipe,
  totalTime,
  whyThisWorks,
  type RecipeDoc,
  type RecipeIngredientDoc,
} from "@/domain/recipes";
import { getLocale, t, useLocale, type StringKey } from "@/i18n";
import { services, type Member } from "@/services";
import { pantryEntries, STAPLES } from "@/services/picks";
import { useSession } from "@/state/session";

export default function RecipeScreen() {
  useLocale();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const householdId = useSession((s) => s.householdId);
  const recipe = useQuery({ queryKey: ["recipe", id], queryFn: () => services.recipe.getRecipe(id!), enabled: !!id });
  const kitchen = useQuery({
    queryKey: ["kitchen", householdId],
    queryFn: () => services.kitchen.getKitchen(householdId!),
    enabled: !!householdId,
  });
  const members = useQuery({
    queryKey: ["members", householdId],
    queryFn: () => services.preference.listMembers(householdId!),
    enabled: !!householdId,
  });

  return (
    <Screen>
      <View style={styles.top}>
        <IconButton label={t("onb.back")} onPress={() => router.back()}>
          <Icon name="back" />
        </IconButton>
        {recipe.data && householdId ? <SaveHeart householdId={householdId} recipeId={recipe.data.parent_id ?? recipe.data.id ?? recipe.data.slug} /> : null}
      </View>
      {recipe.isPending ? (
        <StateView state="loading" title={t("state.loading.home")} />
      ) : recipe.isError ? (
        <StateView
          state="error"
          title={t("recipe.notFound")}
          body={t("state.error.body")}
          actionLabel={t("state.retry")}
          onAction={() => recipe.refetch()}
        />
      ) : (
        <RecipeBody doc={recipe.data} items={kitchen.data ?? []} members={members.data ?? []} householdId={householdId!} />
      )}
    </Screen>
  );
}

/** KIT-055: save the dish for the household (an adapted version saves the dish it came from). */
function SaveHeart({ householdId, recipeId }: { householdId: string; recipeId: string }) {
  const { colors } = useTheme();
  const memberId = useSession((s) => s.memberId);
  const qc = useQueryClient();
  const favourites = useQuery({ queryKey: ["favourites", householdId], queryFn: () => services.recipe.listFavourites(householdId) });
  const saved = (favourites.data ?? []).some((d) => d.id === recipeId || d.slug === recipeId);
  const toggle = useMutation({
    mutationFn: (on: boolean) => services.recipe.setFavourite({ householdId, memberId: memberId!, recipeId, on }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["favourites", householdId] }),
  });
  if (!memberId || !favourites.data) return null;
  return (
    <IconButton label={saved ? t("recipe.unsave") : t("recipe.save")} onPress={() => !toggle.isPending && toggle.mutate(!saved)}>
      <Icon name="heart" color={saved ? colors.alert : undefined} fill={saved ? colors.alert : undefined} />
    </IconButton>
  );
}

function RecipeBody({
  doc,
  items,
  members,
  householdId,
}: {
  doc: RecipeDoc;
  items: Parameters<typeof pantryEntries>[0];
  members: Member[];
  householdId: string;
}) {
  const { colors } = useTheme();
  const router = useRouter();
  const locale = getLocale();
  const whoEating = useSession((s) => s.whoEating);
  const eaters = whoEating ? members.filter((m) => whoEating.includes(m.id)) : members;
  const [servings, setServings] = useState(Math.max(1, eaters.length || doc.base_servings));
  const [listed, setListed] = useState<string[]>([]);

  const match = useMemo(() => pantryMatch(toRankRecipe(doc), pantryEntries(items), STAPLES), [doc, items]);
  const byKey = new Map(match.items.map((m) => [m.key, m]));
  const missing = match.items.filter((m) => m.status === "missing" && !listed.includes(m.key));
  const nameOf = (key: string) => displayName(catalogEntry(key), key, locale);

  const addToList = useMutation({
    mutationFn: (keys: string[]) => services.kitchen.addToList(householdId, keys.map((k) => ({ name: k, reason: "manual" as const }))),
    onSuccess: (_, keys) => setListed((l) => [...l, ...keys]),
  });
  // What was said about this dish last time (KIT-104): shown before cooking, so it is acted on.
  const memories = useQuery({ queryKey: ["memories", householdId], queryFn: () => services.preference.listMemories(householdId) });
  const dishIds = [doc.id, doc.parent_id, doc.slug].filter(Boolean);
  const remembered = (memories.data ?? []).filter((m) => m.recipeId !== null && dishIds.includes(m.recipeId));
  const changes = useAmountChanges(householdId, doc);

  // Opened from a pick on Home: the session remembers which suggestion it came from.
  const { rec } = useLocalSearchParams<{ rec?: string }>();
  const start = useMutation({
    mutationFn: () =>
      services.cooking.startSession({
        householdId,
        recipeId: doc.id ?? doc.slug,
        servings,
        whoEating: eaters.map((e) => e.id),
        recommendationId: rec || undefined,
        languageCode: LANGUAGE_CODES[locale],
      }),
    onSuccess: (sessionId) => router.push(`/cook/${sessionId}`),
  });

  const title = recipeTitle(doc, locale);
  const photo = dishImage(doc.slug);
  const why = whyThisWorks(doc.flavor_profile, locale);
  const branches = familyBranches(doc, eaters.map((e) => ({ name: e.displayName, ageGroup: e.ageGroup })));
  const notes = eaters.filter((e) => e.notes);
  const time = totalTime(doc);

  return (
    <>
      <View style={styles.titleRow}>
        <View style={{ flex: 1, gap: space.xs }}>
          <Text variant="title" accessibilityRole="header">
            {title}
          </Text>
          <Text muted>
            {[time ? t("home.minutes", { min: time }) : null, t("recipe.spice", { n: doc.spice_level })].filter(Boolean).join(" · ")}
          </Text>
        </View>
        {photo ? (
          <Image source={photo} style={styles.photo} accessible={false} />
        ) : (
          <View style={[styles.photo, { backgroundColor: colors.limePale }]} accessible={false} />
        )}
      </View>
      {doc.parent_id ? (
        <View style={[styles.note, { backgroundColor: colors.limePale, gap: space.xs }]}>
          <Text variant="label" weight={500}>
            {t("adapt.yourVersion")}
          </Text>
          <Text variant="label">{doc.description}</Text>
        </View>
      ) : (
        <>
          {doc.review_status !== "approved" ? (
            <View style={[styles.badge, { backgroundColor: colors.amberSoft }]}>
              <Text variant="caption">{t("recipe.draft")}</Text>
            </View>
          ) : null}
          <Text muted>{doc.description}</Text>
        </>
      )}

      {/* The screen's one lime card: can I cook this now? */}
      <Card hero>
        <Text variant="heading">
          {match.have === match.total ? t("recipe.haveAll") : t("recipe.haveOf", { have: match.have, total: match.total })}
        </Text>
        <View style={[styles.track, { backgroundColor: colors.limePale }]} accessible={false}>
          <View style={[styles.fill, { backgroundColor: colors.lime, width: `${match.total ? (match.have / match.total) * 100 : 0}%` }]} />
        </View>
        {missing.length > 0 ? (
          <Button
            kind="secondary"
            label={missing.length === 1 ? t("recipe.addOne") : t("recipe.addMissing", { n: missing.length })}
            disabled={addToList.isPending}
            onPress={() => addToList.mutate(missing.map((m) => m.key))}
          />
        ) : null}
      </Card>

      {remembered.length ? (
        <Card tint={colors.amberSoft}>
          <Text variant="label" muted>
            {t("recipe.remembered")}
          </Text>
          {remembered.map((m) => (
            <Text key={m.id} variant="bodyStrong">
              {m.statement}
            </Text>
          ))}
        </Card>
      ) : null}

      <Button
        size="cook"
        label={start.isPending ? t("cook.starting") : t("cook.start")}
        disabled={start.isPending}
        onPress={() => start.mutate()}
      />
      {start.isError ? (
        <Text color={colors.alert} accessibilityLiveRegion="polite">
          {t("state.error.body")}
        </Text>
      ) : null}
      <Button kind="secondary" label={t("recipe.adapt")} onPress={() => router.push(`/adapt/${doc.id ?? doc.slug}`)} />

      <View style={styles.servings}>
        <IconButton label={t("recipe.fewer")} muted onPress={() => setServings((s) => Math.max(1, s - 1))}>
          <Text variant="heading">−</Text>
        </IconButton>
        <Text variant="bodyStrong" style={{ flex: 1, textAlign: "center" }} accessibilityLiveRegion="polite">
          {servings === 1 ? t("recipe.cookingForOne") : t("recipe.cookingFor", { n: servings })}
        </Text>
        <IconButton label={t("recipe.more")} muted onPress={() => setServings((s) => Math.min(20, s + 1))}>
          <Text variant="heading">+</Text>
        </IconButton>
      </View>

      <Text variant="heading">{t("recipe.ingredients")}</Text>
      <Card>
        {doc.ingredients.map((ing, i) => (
          <IngredientRow
            key={`${ing.ingredient}-${i}`}
            ing={ing}
            match={byKey.get(ing.ingredient)}
            servings={servings}
            base={doc.base_servings}
            nameOf={nameOf}
            listed={listed.includes(ing.ingredient)}
            onAdd={() => addToList.mutate([ing.ingredient])}
            change={changes.get(ing.ingredient)}
          />
        ))}
      </Card>

      {why ? (
        <>
          <Text variant="heading">{t("recipe.why")}</Text>
          <Card>
            {why.bars.map((b) => (
              <View key={b.key} style={styles.barRow} accessible accessibilityLabel={`${t(`recipe.flavor.${b.key}` as StringKey)} ${Math.round(b.value * 10)}/10`}>
                <Text variant="label" style={styles.barLabel}>
                  {t(`recipe.flavor.${b.key}` as StringKey)}
                </Text>
                <View style={[styles.track, { flex: 1, backgroundColor: colors.surfaceMuted }]}>
                  <View style={[styles.fill, { backgroundColor: colors.limeText, width: `${b.value * 100}%` }]} />
                </View>
              </View>
            ))}
            <Text>{why.sentence}</Text>
          </Card>
        </>
      ) : null}

      {branches.length || notes.length ? (
        <>
          <Text variant="heading">{t("recipe.family")}</Text>
          <Card>
            {branches.map((b) => (
              <View key={`${b.step}-${b.ageGroup}`} style={{ gap: 2 }}>
                <Text variant="bodyStrong">
                  {b.members.join(", ")} · {t("recipe.familyStep", { n: b.step })}
                </Text>
                <Text>{b.action}</Text>
              </View>
            ))}
            {notes.map((m) => (
              <Text key={m.id} muted>
                {t("recipe.note", { name: m.displayName, note: m.notes! })}
              </Text>
            ))}
          </Card>
        </>
      ) : null}

      <Text variant="heading">{t("recipe.steps")}</Text>
      {doc.steps.map((s, i) => {
        const branch = branches.find((b) => b.step === i + 1);
        const mins = s.minutes ?? (s.seconds ? Math.max(1, Math.round(s.seconds / 60)) : null);
        return (
          <Card key={i}>
            <View style={styles.stepHead}>
              <View style={[styles.stepNo, { backgroundColor: colors.surfaceMuted }]}>
                <Text variant="label" weight={500}>
                  {i + 1}
                </Text>
              </View>
              <Text variant="caption" muted style={{ flex: 1 }}>
                {[mins ? t("recipe.stepTime", { min: mins }) : null, s.whistles ? t("recipe.whistles", { n: s.whistles }) : null]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
            </View>
            <Text variant="bodyStrong">{s.text}</Text>
            {s.cue ? (
              <Text muted>
                {t("recipe.cue")}: {s.cue}
              </Text>
            ) : null}
            {branch ? (
              <View style={[styles.note, { backgroundColor: colors.limePale }]}>
                <Text variant="label">
                  {branch.members.join(", ")}: {branch.action}
                </Text>
              </View>
            ) : null}
            {s.safety ? (
              <View style={[styles.note, { backgroundColor: colors.alertSoft }]} accessibilityRole="alert">
                <Text variant="label" color={colors.alert} weight={500}>
                  {t("recipe.safety")}: {s.safety}
                </Text>
              </View>
            ) : null}
          </Card>
        );
      })}
    </>
  );
}

function IngredientRow({
  ing,
  match,
  servings,
  base,
  nameOf,
  listed,
  onAdd,
  change,
}: {
  change?: AmountChange;
  ing: RecipeIngredientDoc;
  match: IngredientMatch | undefined;
  servings: number;
  base: number;
  nameOf: (key: string) => string;
  listed: boolean;
  onAdd: () => void;
}) {
  const { colors } = useTheme();
  const { label: amount, note: changeNote } = rememberedAmount(ing, base, servings, change);
  const status = ing.optional ? "optional" : (match?.status ?? "missing");
  const detail =
    status === "have"
      ? t("recipe.have")
      : status === "assumed"
        ? t("recipe.assumed")
        : status === "substitute" && match?.substitute
          ? t("recipe.useInstead", { item: nameOf(match.substitute) })
          : status === "optional"
            ? t("recipe.optional")
            : match?.substitute
              ? `${t("recipe.missing")} · ${t("recipe.orUse", { item: nameOf(match.substitute) })}`
              : t("recipe.missing");
  const icon = status === "have" || status === "assumed" ? "check" : status === "substitute" ? "forward" : null;
  return (
    <View style={styles.ingRow} accessible accessibilityLabel={[nameOf(ing.ingredient), amount, changeNote, detail].filter(Boolean).join(", ")}>
      <View style={[styles.ingIcon, { backgroundColor: status === "missing" ? colors.amberSoft : colors.surfaceMuted }]}>
        {icon ? <Icon name={icon} size={16} color={status === "have" ? colors.limeText : colors.inkSecondary} /> : null}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong">{nameOf(ing.ingredient)}</Text>
        <Text variant="caption" color={status === "missing" ? colors.orangeStrong : colors.inkSecondary}>
          {detail}
        </Text>
      </View>
      <View style={styles.amount}>
        <Text variant="label" muted style={{ textAlign: "right" }}>
          {amount}
        </Text>
        {changeNote ? (
          <Text variant="caption" color={colors.limeText} style={{ textAlign: "right" }}>
            {changeNote}
          </Text>
        ) : null}
        {status === "missing" ? (
          listed ? (
            <Text variant="caption" color={colors.limeText}>
              {t("recipe.added")}
            </Text>
          ) : (
            <IconButton label={`${t("recipe.addOne")}: ${nameOf(ing.ingredient)}`} muted onPress={onAdd}>
              <Icon name="cart" size={20} />
            </IconButton>
          )
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", justifyContent: "space-between" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  photo: { width: 112, height: 112, borderRadius: 56 },
  badge: { alignSelf: "flex-start", borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: space.xs },
  track: { height: 8, borderRadius: radius.pill, overflow: "hidden" },
  fill: { height: 8, borderRadius: radius.pill },
  servings: { flexDirection: "row", alignItems: "center", gap: space.md },
  ingRow: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 56 },
  amount: { alignItems: "flex-end", gap: space.xs, maxWidth: 132 },
  ingIcon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  barRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  barLabel: { width: 80 },
  stepHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  stepNo: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  note: { borderRadius: radius.tag, padding: space.md },
});
