// The signed-in member's voice settings (KIT-068). Loading them also sets the app's read-aloud pace.
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

import { DEFAULT_PROFILE } from "@/domain/voiceStyle";
import { services } from "@/services";
import { setSpeechPace } from "@/services/feedback";
import { useSession } from "@/state/session";

export function useVoiceProfile() {
  const memberId = useSession((s) => s.memberId);
  const q = useQuery({
    queryKey: ["voiceProfile", memberId],
    queryFn: () => services.preference.getVoiceProfile(memberId!),
    enabled: !!memberId,
  });
  const pace = q.data?.pace;
  useEffect(() => {
    if (pace) setSpeechPace(pace);
  }, [pace]);
  return { profile: q.data ?? DEFAULT_PROFILE, query: q, memberId };
}
