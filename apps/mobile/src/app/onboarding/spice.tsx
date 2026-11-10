// KIT-023 step 2 of 3: how spicy. Five big choices instead of a slider (easier to hit, readable, voice-friendly).
import { useRouter } from "expo-router";

import { ChoiceRow } from "@/components/onboarding/ChoiceRow";
import { StepScreen } from "@/components/onboarding/StepScreen";
import type { Spice } from "@/domain/onboarding";
import { t, useLocale, type StringKey } from "@/i18n";
import { useOnboarding } from "@/state/onboarding";

const LEVELS: Spice[] = [1, 2, 3, 4, 5];

export default function SpiceScreen() {
  useLocale();
  const router = useRouter();
  const { spice, setSpice } = useOnboarding();
  return (
    <StepScreen
      step={3}
      title={t("onb.spice.title")}
      body={t("onb.spice.body")}
      onAction={() => router.push("/onboarding/diet")}
    >
      {LEVELS.map((n) => (
        <ChoiceRow key={n} label={t(`spice.${n}` as StringKey)} selected={spice === n} onPress={() => setSpice(n)} />
      ))}
    </StepScreen>
  );
}
