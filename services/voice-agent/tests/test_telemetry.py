from types import SimpleNamespace as NS

from cookmate_voice.telemetry import MAX_TURNS_KEPT, VoiceTelemetry, percentile


def tel() -> VoiceTelemetry:
    return VoiceTelemetry(
        llm_model="claude-haiku-5-5", stt_model="saaras:v3", tts_model="bulbul:v3", language="hi-IN"
    )


def test_percentile_matches_postgres_percentile_cont():
    assert percentile([], 0.5) is None
    assert percentile([280, 300, 320, 1400], 0.5) == 310
    assert round(percentile([280, 300, 320, 1400], 0.95)) == 1238  # same as the pgTAP test


def test_model_turn_latency_is_eou_plus_ttft_plus_ttfb_in_any_order():
    t = tel()
    t.on_metrics(NS(type="tts_metrics", speech_id="a", ttfb=0.2, characters_count=40, cancelled=False))
    t.on_metrics(NS(type="eou_metrics", speech_id="a", end_of_utterance_delay=0.3))
    assert t.turns == []
    t.on_metrics(
        NS(
            type="llm_metrics",
            speech_id="a",
            ttft=0.35,
            prompt_tokens=2100,
            prompt_cached_tokens=2000,
            completion_tokens=60,
            cancelled=False,
        )
    )
    assert t.turns == [(850, False)]
    assert (t.llm_input_tokens, t.llm_cached_tokens, t.llm_output_tokens, t.tts_characters) == (
        100,
        2000,
        60,
        40,
    )


def test_cancelled_replies_are_not_turns_but_still_cost():
    t = tel()
    t.on_metrics(NS(type="eou_metrics", speech_id="b", end_of_utterance_delay=0.3))
    t.on_metrics(
        NS(
            type="llm_metrics",
            speech_id="b",
            ttft=0.4,
            prompt_tokens=500,
            prompt_cached_tokens=0,
            completion_tokens=10,
            cancelled=True,
        )
    )
    t.on_metrics(NS(type="tts_metrics", speech_id="b", ttfb=0.2, characters_count=12, cancelled=True))
    assert t.turns == []
    assert (t.llm_input_tokens, t.tts_characters) == (500, 12)


def test_fast_path_uses_the_last_end_of_utterance_once():
    t = tel()
    t.on_metrics(NS(type="eou_metrics", speech_id=None, end_of_utterance_delay=0.25))
    t.fast_path_turn(0.05)
    t.fast_path_turn(0.04)
    assert t.turns == [(300, True), (40, True)]


def test_summary_is_what_record_voice_session_takes():
    t = tel()
    for ms in (280, 300, 320):
        t.fast_path_turn(ms / 1000)
    t.on_metrics(NS(type="eou_metrics", speech_id="c", end_of_utterance_delay=0.5))
    t.on_metrics(
        NS(
            type="llm_metrics",
            speech_id="c",
            ttft=0.6,
            prompt_tokens=10,
            prompt_cached_tokens=0,
            completion_tokens=5,
            cancelled=False,
        )
    )
    t.on_metrics(NS(type="tts_metrics", speech_id="c", ttfb=0.3, characters_count=30, cancelled=False))
    t.cached_speech(120)
    s = t.summary(stt_seconds=42.04, end_reason="participant_left")
    assert (s["turns"], s["fast_path_turns"], s["p50_latency_ms"], s["p95_latency_ms"]) == (4, 3, 310, 1238)
    assert s["stt_seconds"] == 42.0 and s["tts_cached_characters"] == 120
    assert s["turn_latencies"][-1] == {"ms": 1400, "fast_path": False}
    assert "transcript" not in s and "text" not in s


def test_turn_list_is_capped():
    t = tel()
    for _ in range(MAX_TURNS_KEPT + 5):
        t.fast_path_turn(0.1)
    assert len(t.summary(0)["turn_latencies"]) == MAX_TURNS_KEPT
