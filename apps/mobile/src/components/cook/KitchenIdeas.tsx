// Sprint 15 M4, "the cook's mind": "Your kitchen can make these right now", at most three, with dishes one swap
// away showing the swap and the job it keeps. Near a festival, sweets and snacks first. Recipes come from the
// bundled library (the same content the backend serves); the pantry and the family's avoid list from the services.
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { View } from "react-native";

import { catalogEntry } from "@/data/catalog";
import calendarJson from "@/data/calendar.json";
import { recipeDocs } from "@/data/recipes";
import { Icon } from "@/design-system/icons";
import { dishImage } from "@/design-system/media";
import { Enter, PressableScale } from "@/design-system/motion";
import { Photo, Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { radius, shadow, space } from "@/design-system/tokens";
import { kitchenIdeas, occasionOn } from "@/domain/kitchenIdeas";
import { displayName } from "@/domain/kitchen";
import { recipeTitle } from "@/domain/recipes";
import { jobOf } from "@/domain/swaps";
import { getLocale, t, type StringKey } from "@/i18n";
import { services } from "@/services";
import { pantryEntries, STAPLES } from "@/services/picks";

const EVENTS = (calendarJson as { date: string; end: string | null; kind: string }[]).map((e) => ({
  event_date: e.date, end_date: e.end, kind: e.kind,
}));

export function KitchenIdeas({ householdId }: { householdId: string }) {
  const router = useRouter();
  const { colors } = useTheme();
  const kitchen = useQuery({ queryKey: ["kitchen", householdId], queryFn: () => services.kitchen.getKitchen(householdId) });
  const memories = useQuery({ queryKey: ["memories", householdId], queryFn: () => services.preference.listMemories(householdId) });
  if (!kitchen.data || !memories.data) return null;

  const avoid = memories.data
    .filter((m) => m.polarity < 0 && m.ingredientKey && !m.recipeId && (m.about ?? "preference") === "preference")
    .map((m) => m.ingredientKey!);
  const today = new Date().toISOString().slice(0, 10);
  const occasion = occasionOn(EVENTS, today);
  const ideas = kitchenIdeas(recipeDocs, pantryEntries(kitchen.data), STAPLES, { avoid, occasion });
  if (!ideas.length) return null;
  const l = getLocale();
  const name = (k: string) => displayName(catalogEntry(k), k, l);

  return (
    <View style={{ gap: space.sm }}>
      <Text variant="subheading">{t(occasion === "festival" ? "ideas.titleFestive" : "ideas.title")}</Text>
      {ideas.map((i, n) => (
        <Enter key={i.doc.slug} index={n}>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={recipeTitle(i.doc, l)}
            onPress={() => router.push(`/recipe/${i.doc.slug}`)}
            style={[{ flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, borderRadius: radius.card }, shadow.card, { backgroundColor: colors.surface }]}
          >
            <Photo source={dishImage(i.doc.slug)} size={56} round />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="bodyStrong">{recipeTitle(i.doc, l)}</Text>
              <Text variant="caption" muted>
                {i.kind === "ready"
                  ? t("ideas.ready", { n: i.parts })
                  : t("ideas.oneSwap", {
                      use: name(i.swap!.to),
                      instead: name(i.swap!.from),
                      job: t(`job.${jobOf(i.swap!)}` as StringKey),
                    })}
              </Text>
            </View>
            <Icon name="forward" size={20} color={colors.inkSecondary} />
          </PressableScale>
        </Enter>
      ))}
    </View>
  );
}
