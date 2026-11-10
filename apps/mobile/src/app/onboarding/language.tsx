// ONB-02 / KIT-022: pick a language by tapping a big button; the prompt is also spoken for people who read little.
import * as Speech from "expo-speech";
import { useRouter } from "expo-router";
import { useEffect } from "react";

import { ChoiceRow } from "@/components/onboarding/ChoiceRow";
import { StepScreen } from "@/components/onboarding/StepScreen";
import { Button } from "@/design-system/primitives";
import { LANGUAGE_CODES } from "@/domain/onboarding";
import { LOCALES, setLocale, t, useLocale, type Locale, type StringKey } from "@/i18n";

const SPOKEN_LANGUAGE = "hi-IN";

function speakPrompt() {
  Speech.stop();
  Speech.speak(t("onb.language.speak"), { language: SPOKEN_LANGUAGE, rate: 0.9 });
}

export default function LanguageScreen() {
  const locale = useLocale();
  const router = useRouter();

  useEffect(() => {
    speakPrompt();
    return () => {
      Speech.stop();
    };
  }, []);

  const choose = (l: Locale) => {
    setLocale(l);
    Speech.stop();
    Speech.speak(t(`lang.${l}` as StringKey), { language: LANGUAGE_CODES[l] === "en-IN" ? "en-IN" : SPOKEN_LANGUAGE });
  };

  return (
    <StepScreen
      step={1}
      title={t("onb.language.title")}
      onAction={() => router.push("/onboarding/members")}
      footer={<Button kind="quiet" label={t("onb.language.listen")} onPress={speakPrompt} />}
    >
      {LOCALES.map((l) => (
        <ChoiceRow key={l} large label={t(`lang.${l}` as StringKey)} selected={locale === l} onPress={() => choose(l)} />
      ))}
    </StepScreen>
  );
}
