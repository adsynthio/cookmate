// Save an anonymous kitchen with an email, step 2: the code from the email.
import { Redirect, useLocalSearchParams } from "expo-router";

import { CodeStep } from "@/components/auth/CodeStep";

export default function SaveCodeScreen() {
  const { email, sentAt } = useLocalSearchParams<{ email?: string; sentAt?: string }>();
  if (!email) return <Redirect href="/account/email" />;
  return <CodeStep email={email} mode="link" sentAt={sentAt} />;
}
