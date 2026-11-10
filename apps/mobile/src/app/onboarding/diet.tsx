// KIT-023 step 3 of 3: the household's diet. Per-person diets are edited later on the You tab.
import { useRouter } from "expo-router";

import { ChoiceRow } from "@/components/onboarding/ChoiceRow";
import { StepScreen } from "@/components/onboarding/StepScreen";
import type { Diet } from "@/domain/onboarding";
import { t, useLocale, type StringKey } from "@/i18n";
import { useOnboarding } from "@/state/onboarding";

const DIETS: Diet[] = ["veg", "eggetarian", "nonveg", "jain", "vegan"];

export default function DietScreen() {
  useLocale();
  const router = useRouter();
  const { diet, setDiet } = useOnboarding();
  return (
    <StepScreen
      step={4}
      title={t("onb.diet.title")}
      body={t("onb.diet.body")}
      onAction={() => router.push("/onboarding/consent")}
    >
      {DIETS.map((d) => (
        <ChoiceRow key={d} label={t(`diet.${d}` as StringKey)} selected={diet === d} onPress={() => setDiet(d)} />
      ))}
    </StepScreen>
  );
}
