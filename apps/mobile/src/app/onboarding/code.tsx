// Sign up or log in, step 2: the 6-digit code from the email (components/auth/CodeStep.tsx).
import { Redirect, useLocalSearchParams } from "expo-router";

import { CodeStep } from "@/components/auth/CodeStep";

export default function CodeScreen() {
  const { email, mode, sentAt } = useLocalSearchParams<{ email?: string; mode?: string; sentAt?: string }>();
  // Opened without an email (a reload of this page on the web): start again from the email step.
  if (!email) return <Redirect href="/onboarding" />;
  return <CodeStep email={email} mode={mode === "login" ? "login" : "signup"} sentAt={sentAt} />;
}
