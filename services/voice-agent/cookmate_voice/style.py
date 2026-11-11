"""How the assistant speaks to this cook (KIT-068, VOICE-09).

voice_profiles hold units, pace, detail and skill for each member. They shape three things:
  * the speaking rate sent to Sarvam TTS,
  * a short block of instructions added to the system prompt,
  * how a recipe step is read out: a beginner hears the sensory cue ("until the oil shimmers"),
    an expert hears just the instruction. The safety note is always read, word for word.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, replace
from typing import Any, Literal

Pace = Literal["slow", "normal", "fast"]
Verbosity = Literal["detailed", "normal", "brief"]
Skill = Literal["beginner", "intermediate", "confident", "expert"]
Units = Literal["metric", "local", "mixed"]

TTS_PACE: dict[str, float] = {"slow": 0.85, "normal": 1.0, "fast": 1.15}


@dataclass(frozen=True)
class VoiceStyle:
    name: str | None = None
    language: str = "en-IN"
    pace: Pace = "normal"
    verbosity: Verbosity = "normal"
    skill: Skill = "intermediate"
    units: Units = "local"

    @classmethod
    def from_speaker(cls, speaker: dict[str, Any] | None) -> VoiceStyle:
        """Build from the `speaker` block of get_voice_context; unknown or missing values fall back to defaults."""
        s = speaker or {}

        def pick(key: str, allowed: tuple[str, ...], default: str) -> Any:
            value = s.get(key)
            return value if value in allowed else default

        return cls(
            name=s.get("name"),
            language=s.get("language") or "en-IN",
            pace=pick("pace", ("slow", "normal", "fast"), "normal"),
            verbosity=pick("verbosity", ("detailed", "normal", "brief"), "normal"),
            skill=pick("skill", ("beginner", "intermediate", "confident", "expert"), "intermediate"),
            units=pick("units", ("metric", "local", "mixed"), "local"),
        )

    @property
    def tts_pace(self) -> float:
        return TTS_PACE[self.pace]

    @property
    def wants_cues(self) -> bool:
        """Beginners, and anyone who asked for detail, hear the sensory cue with every step."""
        if self.verbosity == "brief":
            return False
        return self.skill in ("beginner", "intermediate") or self.verbosity == "detailed"

    def slower(self) -> VoiceStyle:
        """'Dheere bolo': one step slower for the rest of the session."""
        return replace(self, pace="normal" if self.pace == "fast" else "slow")


_UNITS = {
    "local": "Say amounts in kitchen measures: katori, chammach, chhota chammach, mutthi, chutki, seeti.",
    "metric": "Say amounts in grams and millilitres.",
    "mixed": "Say amounts in kitchen measures, with grams in brackets the first time.",
}
_DETAIL = {
    "detailed": "Explain the why in one short sentence when it helps.",
    "normal": "Keep answers to one or two short sentences.",
    "brief": "Keep answers to one short sentence. No explanations unless asked.",
}
_SKILL = {
    "beginner": "This cook is learning: always give the sensory cue (smell, colour, sound) and how to check it is done.",
    "intermediate": "Give the sensory cue when a step has one.",
    "confident": "Give cues only when asked or when a step is easy to get wrong.",
    "expert": "This cook is experienced: short prompts, no cues unless asked.",
}


def style_instructions(style: VoiceStyle) -> str:
    """The block appended to the system prompt. Safety rules in the main prompt always win over brevity."""
    lines = [
        "## This cook",
        f"- {_UNITS[style.units]}",
        f"- {_DETAIL[style.verbosity]}",
        f"- {_SKILL[style.skill]}",
        "- Never shorten a safety note, whatever the settings above say.",
    ]
    if style.name:
        lines.insert(1, f"- You are speaking with {style.name}.")
    return "\n".join(lines)


def step_speech(step: dict[str, Any], style: VoiceStyle) -> str:
    """What is said for one recipe step: instruction, cue when this cook wants cues, then the safety note in full."""
    parts = [str(step.get("text") or "").strip()]
    cue = str(step.get("cue") or "").strip()
    if cue and style.wants_cues:
        parts.append(cue)
    safety = str(step.get("safety") or "").strip()
    if safety:
        parts.append(safety)
    return " ".join(_sentence(p) for p in parts if p)


def _sentence(text: str) -> str:
    return text if text[-1] in ".!?।" else f"{text}."


def variant_hash(text: str) -> str:
    """Key of a cached recording: the exact words spoken. Any edit to the step makes a new recording.
    Must match variantHash() in supabase/functions/tts-cache/logic.ts."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]
