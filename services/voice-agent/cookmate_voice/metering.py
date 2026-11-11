"""Speech-to-text metering for gated mode (KIT-081, VOICE-14).

In gated mode only the speech segments Silero VAD finds are sent to Sarvam, so STT cost follows talk time,
not session length. SttMeter adds up what was actually sent (each segment plus VAD padding) so the session
record can show it next to the session's length; the target is at most 40% of the session.
"""

from __future__ import annotations

from dataclasses import dataclass, field

TARGET_RATIO = 0.40


@dataclass
class SttMeter:
    """Seconds of audio sent for recognition, and the session clock."""

    started_at: float
    sent_seconds: float = 0.0
    segments: int = 0
    _ended_at: float | None = field(default=None, repr=False)

    def add_segment(self, seconds: float) -> None:
        if seconds > 0:
            self.sent_seconds += seconds
            self.segments += 1

    def end(self, at: float) -> None:
        self._ended_at = at

    def session_seconds(self, now: float) -> float:
        return max(0.0, (self._ended_at if self._ended_at is not None else now) - self.started_at)

    def ratio(self, now: float) -> float:
        total = self.session_seconds(now)
        return self.sent_seconds / total if total else 0.0

    def summary(self, now: float) -> dict[str, float | int | bool]:
        ratio = self.ratio(now)
        return {
            "stt_seconds": round(self.sent_seconds, 1),
            "session_seconds": round(self.session_seconds(now), 1),
            "segments": self.segments,
            "stt_ratio": round(ratio, 3),
            "within_target": ratio <= TARGET_RATIO,
        }


def sarvam_language(code: str) -> str:
    """Sarvam takes BCP-47 codes for Indian languages; Hinglish (hi-Latn-IN) is spoken Hindi."""
    if code.startswith("hi"):
        return "hi-IN"
    return code if code.endswith("-IN") else "en-IN"
