import asyncio
from pathlib import Path

import httpx

from cookmate_voice.metering import SttMeter, sarvam_language
from cookmate_voice.step_audio import StepAudioCache, cache_path, public_url
from cookmate_voice.style import variant_hash


def test_gated_session_stays_under_forty_percent():
    # A 15-minute cooking session: 25 short utterances of ~2.5 s each, plus 0.5 s VAD padding per segment.
    meter = SttMeter(started_at=0.0)
    for _ in range(25):
        meter.add_segment(2.5 + 0.5)
    meter.end(15 * 60)
    s = meter.summary(now=10_000)
    assert s["stt_seconds"] == 75.0 and s["session_seconds"] == 900.0 and s["segments"] == 25
    assert s["within_target"] is True and s["stt_ratio"] < 0.1


def test_streaming_everything_would_fail_the_target():
    meter = SttMeter(started_at=0.0)
    meter.add_segment(900.0)
    assert meter.summary(now=900.0)["within_target"] is False
    meter.add_segment(-3)  # ignored
    assert meter.segments == 1


def test_sarvam_language_codes():
    assert sarvam_language("hi-Latn-IN") == "hi-IN"
    assert sarvam_language("hi-IN") == "hi-IN"
    assert sarvam_language("en-IN") == "en-IN"
    assert sarvam_language("fr") == "en-IN"


def test_cache_path_and_lookup():
    path = cache_path("hi-IN", "default", "step-1", "Heat ghee.")
    assert path == f"hi-IN/default/step-1/{variant_hash('Heat ghee.')}.mp3"
    assert public_url("https://x.supabase.co/", path).startswith(
        "https://x.supabase.co/storage/v1/object/public/step-audio/hi-IN/"
    )

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith(f"{variant_hash('Heat ghee.')}.mp3"):
            return httpx.Response(200, content=b"ID3fake")
        return httpx.Response(400)

    async def scenario():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            cache = StepAudioCache("https://x.supabase.co", client)
            hit = await cache.fetch("hi-IN", None, "step-1", "Heat ghee.")
            assert await cache.fetch("hi-IN", None, "step-1", "Heat oil.") is None  # not recorded: live TTS
            assert await cache.fetch("hi-IN", None, None, "Heat ghee.") is None
            return hit

    hit = asyncio.run(scenario())
    assert hit is not None and Path(hit).read_bytes() == b"ID3fake"
