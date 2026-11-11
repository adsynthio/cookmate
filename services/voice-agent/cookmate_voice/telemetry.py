"""Voice session telemetry (KIT-069, VOICE-14).

Counts what a voice session used and how fast it answered, then hands one summary to the database
(public.record_voice_session), which prices it and keeps it on the voice_sessions row. No audio and no transcript
is kept: only counts, models and latencies.

Turn latency is measured the way LiveKit recommends: end-of-utterance delay + the language model's time to first
token + text-to-speech time to first byte, for each reply. Fast-path turns (VOICE-06) skip the model, so their
latency is the end-of-utterance delay plus the time the agent took to start answering.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any

MAX_TURNS_KEPT = 500


def percentile(values: list[float], q: float) -> float | None:
    """Linear interpolation between closest ranks: the same as Postgres percentile_cont."""
    if not values:
        return None
    s = sorted(values)
    pos = (len(s) - 1) * q
    lo, hi = math.floor(pos), math.ceil(pos)
    return s[lo] + (s[hi] - s[lo]) * (pos - lo)


@dataclass
class _Reply:
    eou: float | None = None
    ttft: float | None = None
    ttfb: float | None = None


@dataclass
class VoiceTelemetry:
    llm_model: str
    stt_model: str
    tts_model: str
    language: str
    llm_input_tokens: int = 0
    llm_cached_tokens: int = 0
    llm_output_tokens: int = 0
    tts_characters: int = 0
    tts_cached_characters: int = 0
    turns: list[tuple[int, bool]] = field(default_factory=list)
    _replies: dict[str, _Reply] = field(default_factory=dict, repr=False)
    _last_eou: float | None = field(default=None, repr=False)

    def on_metrics(self, m: Any) -> None:
        """Feed every metrics_collected event's metrics here."""
        kind = getattr(m, "type", None)
        sid = getattr(m, "speech_id", None)
        if kind == "llm_metrics":
            cached = int(getattr(m, "prompt_cached_tokens", 0) or 0)
            self.llm_cached_tokens += cached
            # prompt_tokens counts fresh input, cache writes and cache reads together.
            self.llm_input_tokens += max(0, int(m.prompt_tokens or 0) - cached)
            self.llm_output_tokens += int(m.completion_tokens or 0)
            if sid and not getattr(m, "cancelled", False):
                self._reply(sid).ttft = float(m.ttft)
                self._finish(sid)
        elif kind == "tts_metrics":
            self.tts_characters += int(m.characters_count or 0)
            if sid and not getattr(m, "cancelled", False):
                self._reply(sid).ttfb = float(m.ttfb)
                self._finish(sid)
        elif kind == "eou_metrics":
            delay = float(m.end_of_utterance_delay or 0.0)
            self._last_eou = delay
            if sid:
                self._reply(sid).eou = delay
                self._finish(sid)

    def fast_path_turn(self, handled_in_seconds: float) -> None:
        """A command answered without the language model."""
        eou, self._last_eou = self._last_eou or 0.0, None
        self._add((eou + max(0.0, handled_in_seconds)) * 1000, fast_path=True)

    def cached_speech(self, characters: int) -> None:
        """A step read from the recorded step audio instead of live text-to-speech."""
        self.tts_cached_characters += max(0, characters)

    def _reply(self, sid: str) -> _Reply:
        return self._replies.setdefault(sid, _Reply())

    def _finish(self, sid: str) -> None:
        r = self._replies.get(sid)
        if r and r.eou is not None and r.ttft is not None and r.ttfb is not None:
            del self._replies[sid]
            self._last_eou = None
            self._add((r.eou + r.ttft + r.ttfb) * 1000, fast_path=False)

    def _add(self, ms: float, *, fast_path: bool) -> None:
        if len(self.turns) < MAX_TURNS_KEPT:
            self.turns.append((round(ms), fast_path))

    def summary(self, stt_seconds: float, end_reason: str | None = None) -> dict[str, Any]:
        """The p_stats argument for public.record_voice_session."""
        ms = [float(t[0]) for t in self.turns]
        p50, p95 = percentile(ms, 0.5), percentile(ms, 0.95)
        return {
            "turns": len(self.turns),
            "fast_path_turns": sum(1 for _, fast in self.turns if fast),
            "stt_seconds": round(stt_seconds, 1),
            "tts_characters": self.tts_characters,
            "tts_cached_characters": self.tts_cached_characters,
            "llm_input_tokens": self.llm_input_tokens,
            "llm_cached_tokens": self.llm_cached_tokens,
            "llm_output_tokens": self.llm_output_tokens,
            "p50_latency_ms": None if p50 is None else round(p50),
            "p95_latency_ms": None if p95 is None else round(p95),
            "llm_model": self.llm_model,
            "stt_model": self.stt_model,
            "tts_model": self.tts_model,
            "language": self.language,
            "end_reason": end_reason,
            "turn_latencies": [{"ms": t[0], "fast_path": t[1]} for t in self.turns],
        }
