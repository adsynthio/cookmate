"""Cookmate Voice Cook worker (LiveKit Agents 1.8).

Pipeline per turn (PRD §9.2): Silero VAD -> Sarvam STT -> fast path | Claude Haiku (+ tools) -> Sarvam TTS.

Run locally once LIVEKIT_*, SARVAM_API_KEY and ANTHROPIC_API_KEY are set:
    uv run python agent.py dev
Text-only testing without any keys:
    uv run python harness.py
"""

from __future__ import annotations

import json
import logging
import os
import time
from pathlib import Path
from typing import Any

import httpx
from livekit.agents import (
    Agent,
    AgentSession,
    JobContext,
    JobProcess,
    StopResponse,
    WorkerOptions,
    cli,
    llm,
    stt,
    utils,
)
from livekit.plugins import anthropic, sarvam, silero

from cookmate_voice.backend import KitchenBrain
from cookmate_voice.config import Settings
from cookmate_voice.confirm import ConfirmationGate
from cookmate_voice.fast_path import FastPathMatch, match
from cookmate_voice.metering import SttMeter, sarvam_language
from cookmate_voice.speakers import find_member, greeting, not_found, parse_intro
from cookmate_voice.step_audio import StepAudioCache
from cookmate_voice.style import VoiceStyle, step_speech, style_instructions
from cookmate_voice.telemetry import VoiceTelemetry

log = logging.getLogger("cookmate.voice")
SYSTEM_PROMPT = (Path(__file__).parent / "prompts" / "system.md").read_text(encoding="utf-8")


def instructions_for(packet: dict[str, Any], style: VoiceStyle) -> str:
    return (
        SYSTEM_PROMPT
        + "\n\n"
        + style_instructions(style)
        + "\n\n```json\n"
        + json.dumps(packet, ensure_ascii=False)
        + "\n```"
    )


class CookAgent(Agent):
    """Handles confirmations, speaker switches and fast-path commands before the model ever sees a turn."""

    def __init__(
        self,
        *,
        packet: dict[str, Any],
        meta: dict[str, Any],
        brain: KitchenBrain | None,
        audio: StepAudioCache | None,
        tts_engine: Any,
        telemetry: VoiceTelemetry | None = None,
    ) -> None:
        self.style = VoiceStyle.from_speaker(packet.get("speaker"))
        super().__init__(instructions=instructions_for(packet, self.style))
        self.packet = packet
        self.meta = meta
        self.brain = brain
        self.audio = audio
        self.tts_engine = tts_engine
        self.telemetry = telemetry
        self.language = meta.get("language_code", "en-IN")
        self.gate = ConfirmationGate()

    async def on_user_turn_completed(self, turn_ctx: llm.ChatContext, new_message: llm.ChatMessage) -> None:
        text = new_message.text_content or ""

        if self.gate.pending is not None:
            answer, _ = await self.gate.resolve(text)
            if answer != "unclear":
                self.session.say("Ho gaya." if answer == "yes" else "Theek hai, rehne dete hain.")
                raise StopResponse()

        name = parse_intro(text)
        if name is not None:
            await self.switch_speaker(name)
            raise StopResponse()

        command = match(text)
        started = time.monotonic()
        if command is not None and await self.handle_fast_path(command):
            if self.telemetry is not None:
                self.telemetry.fast_path_turn(time.monotonic() - started)
            raise StopResponse()  # answered without the language model

    # --- KIT-083 ------------------------------------------------------------------------------------------------
    async def switch_speaker(self, name: str) -> None:
        members = (self.packet.get("household") or {}).get("members") or []
        member = find_member(name, members)
        if member is None or not member.get("member_id"):
            self.session.say(not_found(name, members, self.language))
            return
        await self.reload(member_id=member["member_id"])
        self.session.say(greeting(str(member.get("name")), self.language))

    async def reload(self, member_id: str | None = None) -> None:
        """Fetch a fresh context packet (as the user) and re-apply the speaker's style."""
        if self.brain is None:
            return
        if member_id:
            self.meta["member_id"] = member_id
        packet = await self.brain.rpc(
            "get_voice_context",
            {
                "p_household": self.meta.get("household_id"),
                "p_member": self.meta.get("member_id"),
                "p_session": self.meta.get("cooking_session_id"),
            },
        )
        if isinstance(packet, dict):
            self.packet = packet
            self.style = VoiceStyle.from_speaker(packet.get("speaker"))
            await self.update_instructions(instructions_for(packet, self.style))
            self.tts_engine.update_options(pace=self.style.tts_pace)

    # --- fast path (VOICE-06) -----------------------------------------------------------------------------------
    async def handle_fast_path(self, command: FastPathMatch) -> bool:
        """True when the command was fully handled here; False lets the model answer it."""
        log.info("fast_path", extra={"command": command.command, "command_args": command.args})
        session_id = self.meta.get("cooking_session_id")
        if command.command == "slower":
            self.style = self.style.slower()
            self.tts_engine.update_options(pace=self.style.tts_pace)
            await self.read_step()
            return True
        if command.command in ("next", "back") and session_id and self.brain is not None:
            await self.brain.rpc(
                "advance_session_step",
                {
                    "p_session": session_id,
                    "p_delta": 1 if command.command == "next" else -1,
                    "p_channel": "voice",
                },
            )
            await self.reload()
            await self.read_step()
            return True
        if command.command == "repeat" and session_id:
            await self.read_step()
            return True
        return False  # timers, whistles and the rest go to the model with tools

    async def read_step(self) -> None:
        """KIT-080 + KIT-068: the step as this cook likes it, from the cache when it was recorded."""
        current = ((self.packet.get("session") or {}).get("current")) or {}
        text = step_speech(current, self.style)
        if not text:
            return
        path = None
        if self.audio is not None and self.style.pace == "normal":
            # Recordings are made at normal pace; a cook who asked for slower speech gets live TTS.
            path = await self.audio.fetch(sarvam_language(self.language), None, current.get("step_id"), text)
        if path:
            if self.telemetry is not None:
                self.telemetry.cached_speech(len(text))
            self.session.say(text, audio=utils.audio.audio_frames_from_file(path), allow_interruptions=True)
        else:
            self.session.say(text, allow_interruptions=True)


def prewarm(proc: JobProcess) -> None:
    proc.userdata["vad"] = silero.VAD.load()


def build_stt(settings: Settings, language: str, vad: Any) -> stt.STT:
    """KIT-081: in gated mode only VAD speech segments reach Sarvam (batch recognition per segment)."""
    sarvam_stt = sarvam.STT(language=sarvam_language(language), model=settings.stt_model)
    if settings.stt_mode == "gated":
        return stt.StreamAdapter(stt=sarvam_stt, vad=vad)
    return sarvam_stt


async def entrypoint(ctx: JobContext) -> None:
    settings = Settings.from_env()
    await ctx.connect()

    # voice-token puts {member_id, household_id, language_code, cooking_session_id, user_jwt} in the job metadata.
    meta = json.loads(ctx.job.metadata or "{}")
    language = meta.get("language_code", "en-IN")
    http = httpx.AsyncClient(timeout=5.0)
    brain = KitchenBrain(settings, meta["user_jwt"], client=http) if meta.get("user_jwt") else None
    packet: dict[str, Any] = {}
    if brain is not None:
        try:
            packet = (
                await brain.rpc(
                    "get_voice_context",
                    {
                        "p_household": meta.get("household_id"),
                        "p_member": meta.get("member_id"),
                        "p_session": meta.get("cooking_session_id"),
                    },
                )
                or {}
            )
        except httpx.HTTPError as err:
            log.warning("context packet unavailable: %s", err)
    style = VoiceStyle.from_speaker(packet.get("speaker"))

    vad = ctx.proc.userdata["vad"]
    tts_engine = sarvam.TTS(
        target_language_code=sarvam_language(language), model=settings.tts_model, pace=style.tts_pace
    )
    session = AgentSession(
        vad=vad,
        stt=build_stt(settings, language, vad),
        llm=anthropic.LLM(model=settings.turn_model, temperature=0.4, max_tokens=300, caching="ephemeral"),
        tts=tts_engine,
    )

    meter = SttMeter(started_at=time.monotonic())
    # KIT-069: usage and latency for this session, recorded once when it ends (counts only, no transcript).
    telemetry = VoiceTelemetry(
        llm_model=settings.turn_model,
        stt_model=settings.stt_model,
        tts_model=settings.tts_model,
        language=language,
    )

    @session.on("metrics_collected")
    def _count(
        event: Any,
    ) -> None:  # one STT request per VAD segment in gated mode, with the audio it carried
        m = event.metrics
        if getattr(m, "type", None) == "stt_metrics":
            meter.add_segment(float(m.audio_duration or 0.0))
        telemetry.on_metrics(m)

    async def _close(reason: str) -> None:
        log.info("stt_usage", extra=meter.summary(time.monotonic()))
        voice_session_id = meta.get("voice_session_id")
        if brain is not None and voice_session_id:
            try:
                await brain.rpc(
                    "record_voice_session",
                    {
                        "p_voice_session": voice_session_id,
                        "p_stats": telemetry.summary(
                            meter.sent_seconds, end_reason=(reason or "")[:40] or None
                        ),
                    },
                )
            except httpx.HTTPError as err:
                log.warning("voice session not recorded: %s", err)
        await http.aclose()

    ctx.add_shutdown_callback(_close)
    audio = StepAudioCache(settings.supabase_url, http) if settings.supabase_url else None
    agent = CookAgent(
        packet=packet, meta=meta, brain=brain, audio=audio, tts_engine=tts_engine, telemetry=telemetry
    )
    await session.start(room=ctx.room, agent=agent)
    if os.environ.get("COOKMATE_GREET", "1") == "1" and style.name:
        session.say(greeting(style.name, language))


if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            prewarm_fnc=prewarm,
            agent_name=Settings.from_env().agent_name,  # explicit dispatch only (voice-token)
        )
    )
