// Sign up or log in, step 1: the email (components/auth/EmailStep.tsx).
import { useLocalSearchParams } from "expo-router";

import { EmailStep } from "@/components/auth/EmailStep";

export default function EmailScreen() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  return <EmailStep mode={mode === "login" ? "login" : "signup"} />;
}
