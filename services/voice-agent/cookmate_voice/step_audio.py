"""Cached step audio (KIT-080, VOICE-14).

The tts-cache job records each published step once per language and voice into the public step-audio
bucket at {language}/{voice}/{step_id}/{variant_hash}.mp3. Reading a step plays that file when it exists
and falls back to live TTS when it doesn't, so a cache miss is slower, never silent.
"""

from __future__ import annotations

import os
import tempfile
from dataclasses import dataclass

import httpx

from .style import variant_hash

BUCKET = "step-audio"
DEFAULT_VOICE = "default"


def cache_path(language: str, voice_id: str, step_id: str, text: str) -> str:
    return f"{language}/{voice_id}/{step_id}/{variant_hash(text)}.mp3"


def public_url(supabase_url: str, path: str) -> str:
    return f"{supabase_url.rstrip('/')}/storage/v1/object/public/{BUCKET}/{path}"


@dataclass
class StepAudioCache:
    supabase_url: str
    client: httpx.AsyncClient

    async def fetch(self, language: str, voice_id: str | None, step_id: str | None, text: str) -> str | None:
        """A local file with the recording, or None (no step id, not cached yet, or the network failed)."""
        if not step_id or not self.supabase_url:
            return None
        url = public_url(self.supabase_url, cache_path(language, voice_id or DEFAULT_VOICE, step_id, text))
        try:
            r = await self.client.get(url, timeout=2.0)
        except httpx.HTTPError:
            return None
        if r.status_code != 200 or not r.content:
            return None
        fd, path = tempfile.mkstemp(suffix=".mp3", prefix="step-")
        with os.fdopen(fd, "wb") as f:
            f.write(r.content)
        return path
