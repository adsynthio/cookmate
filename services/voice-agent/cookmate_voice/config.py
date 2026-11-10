"""Worker settings from the environment (docs/architecture/13_env_and_secrets.csv)."""

from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    supabase_url: str
    supabase_anon_key: str
    turn_model: str
    stt_model: str
    tts_model: str
    stt_mode: str  # "gated" (VAD segments only, cheapest) or "streaming" (lowest latency)
    agent_name: str
    fx_inr_per_usd: float

    @classmethod
    def from_env(cls) -> Settings:
        return cls(
            supabase_url=os.environ.get("SUPABASE_URL", ""),
            supabase_anon_key=os.environ.get("SUPABASE_ANON_KEY", ""),
            turn_model=os.environ.get("CLAUDE_TURN_MODEL", "claude-haiku-5-5"),
            stt_model=os.environ.get("SARVAM_STT_MODEL", "saaras:v3"),
            tts_model=os.environ.get("SARVAM_TTS_MODEL", "bulbul:v3"),
            stt_mode=os.environ.get("STT_MODE", "gated"),
            agent_name=os.environ.get("LIVEKIT_AGENT_NAME", "cookmate-voice-cook"),
            fx_inr_per_usd=float(os.environ.get("FX_INR_PER_USD", "88")),
        )
