from cookmate_voice.style import VoiceStyle, step_speech, style_instructions, variant_hash

STEP = {"text": "Heat ghee and add cumin", "cue": "until the seeds crackle", "safety": "Keep the lid ajar."}


def test_defaults_when_profile_missing_or_odd():
    s = VoiceStyle.from_speaker({"pace": "warp", "skill": None, "name": "Sunita"})
    assert (s.pace, s.skill, s.verbosity, s.units, s.name) == (
        "normal",
        "intermediate",
        "normal",
        "local",
        "Sunita",
    )
    assert VoiceStyle.from_speaker(None).tts_pace == 1.0


def test_beginner_hears_the_cue_expert_does_not_safety_always():
    beginner = VoiceStyle.from_speaker({"skill": "beginner"})
    expert = VoiceStyle.from_speaker({"skill": "expert"})
    assert (
        step_speech(STEP, beginner) == "Heat ghee and add cumin. until the seeds crackle. Keep the lid ajar."
    )
    assert step_speech(STEP, expert) == "Heat ghee and add cumin. Keep the lid ajar."
    # Brief beats skill for cues, but never drops the safety note.
    brief_beginner = VoiceStyle.from_speaker({"skill": "beginner", "verbosity": "brief"})
    assert "Keep the lid ajar." in step_speech(STEP, brief_beginner)
    assert "crackle" not in step_speech(STEP, brief_beginner)
    # A confident cook who asked for detail gets cues.
    assert "crackle" in step_speech(
        STEP, VoiceStyle.from_speaker({"skill": "confident", "verbosity": "detailed"})
    )


def test_pace_and_slower():
    s = VoiceStyle.from_speaker({"pace": "fast"})
    assert s.tts_pace == 1.15
    assert (
        s.slower().pace == "normal"
        and s.slower().slower().pace == "slow"
        and s.slower().slower().slower().pace == "slow"
    )


def test_instructions_follow_units_and_skill_and_keep_safety():
    text = style_instructions(VoiceStyle.from_speaker({"units": "metric", "skill": "expert", "name": "Ravi"}))
    assert "grams" in text and "experienced" in text and "Ravi" in text and "safety" in text


def test_variant_hash_is_stable_and_text_sensitive():
    assert variant_hash("Heat ghee.") == variant_hash("Heat ghee.")
    assert variant_hash("Heat ghee.") != variant_hash("Heat oil.")
    assert len(variant_hash("x")) == 16
    # Pinned: tts-cache (TypeScript) must produce the same key for the same words.
    assert variant_hash("Heat ghee and add cumin. Keep the lid ajar.") == "819b4c4e362c3c0f"
