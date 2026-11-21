// Save an anonymous kitchen with an email, step 1 (You → Your account). Same account, so nothing moves.
import { EmailStep } from "@/components/auth/EmailStep";

export default function SaveEmailScreen() {
  return <EmailStep mode="link" />;
}
