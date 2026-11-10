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
from pathlib import Path

from livekit.agents import Agent, AgentSession, JobContext, JobProcess, StopResponse, WorkerOptions, cli, llm
from livekit.plugins import anthropic, sarvam, silero

from cookmate_voice.config import Settings
from cookmate_voice.confirm import ConfirmationGate
from cookmate_voice.fast_path import FastPathMatch, match

log = logging.getLogger("cookmate.voice")
SYSTEM_PROMPT = (Path(__file__).parent / "prompts" / "system.md").read_text(encoding="utf-8")


class CookAgent(Agent):
    """Handles fast-path commands and pending confirmations before the model ever sees a turn."""

    def __init__(self, language: str, context_packet: dict) -> None:
        super().__init__(
            instructions=SYSTEM_PROMPT
            + "\n\n```json\n"
            + json.dumps(context_packet, ensure_ascii=False)
            + "\n```"
        )
        self.language = language
        self.gate = ConfirmationGate()

    async def on_user_turn_completed(self, turn_ctx: llm.ChatContext, new_message: llm.ChatMessage) -> None:
        text = new_message.text_content or ""

        if self.gate.pending is not None:
            answer, _ = await self.gate.resolve(text)
            if answer != "unclear":
                self.session.say("Ho gaya." if answer == "yes" else "Theek hai, rehne dete hain.")
                raise StopResponse()

        command = match(text)
        if command is not None:
            await self.handle_fast_path(command)
            raise StopResponse()  # answered without the language model

    async def handle_fast_path(self, command: FastPathMatch) -> None:
        # Sprint 4: drive advance_session_step / session_timers through KitchenBrain and play cached step audio.
        log.info("fast_path", extra={"command": command.command, "command_args": command.args})
        self.session.say(f"({command.command})", allow_interruptions=True)


def prewarm(proc: JobProcess) -> None:
    proc.userdata["vad"] = silero.VAD.load()


async def entrypoint(ctx: JobContext) -> None:
    settings = Settings.from_env()
    await ctx.connect()

    # voice-token puts {member_id, household_id, language_code, cooking_session_id} in the job metadata.
    meta = json.loads(ctx.job.metadata or "{}")
    language = meta.get("language_code", "en-IN")

    session = AgentSession(
        vad=ctx.proc.userdata["vad"],
        stt=sarvam.STT(language=language, model=settings.stt_model),
        llm=anthropic.LLM(model=settings.turn_model, temperature=0.4, max_tokens=300, caching="ephemeral"),
        tts=sarvam.TTS(target_language_code=language, model=settings.tts_model),
    )
    # Sprint 4: fetch the context packet with get_voice_context(household, member, session) as the user.
    await session.start(room=ctx.room, agent=CookAgent(language, context_packet={}))


if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            prewarm_fnc=prewarm,
            agent_name=Settings.from_env().agent_name,  # explicit dispatch only (voice-token)
        )
    )
