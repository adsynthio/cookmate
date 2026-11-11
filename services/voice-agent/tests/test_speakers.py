import pytest

from cookmate_voice.speakers import find_member, greeting, name_key, not_found, parse_intro

FAMILY = [
    {"member_id": "m1", "name": "Sunita"},
    {"member_id": "m2", "name": "Ravi"},
    {"member_id": "m3", "name": "Aarav"},
]


@pytest.mark.parametrize(
    "utterance,name",
    [
        ("Main Sunita hoon", "sunita"),
        ("mai sunita hu", "sunita"),
        ("Namaste, main Ravi bol raha hoon", "ravi"),
        ("main sunita ji hoon.", "sunita"),
        ("I'm Aarav", "aarav"),
        ("this is Ravi", "ravi"),
        ("मैं सुनीता हूँ", "सुनीता"),
        ("मैं रवि बोल रहा हूं", "रवि"),
    ],
)
def test_self_introductions(utterance, name):
    assert parse_intro(utterance) == name


@pytest.mark.parametrize(
    "utterance", ["main ready hoon", "I'm done", "agla step", "main thak gayi hoon abhi", "tamatar kaat liya"]
)
def test_not_introductions(utterance):
    assert parse_intro(utterance) is None


def test_names_match_across_scripts_and_spellings():
    assert name_key("सुनीता") == name_key("Sunita") == name_key("Suneeta")
    assert name_key("रवि") == name_key("Ravi")
    assert name_key("आरव") == name_key("Aarav")
    assert find_member("सुनीता", FAMILY)["member_id"] == "m1"
    assert find_member("suneeta", FAMILY)["member_id"] == "m1"
    assert find_member("aarav", FAMILY)["member_id"] == "m3"
    assert find_member("priya", FAMILY) is None


def test_ambiguous_names_do_not_switch():
    assert (
        find_member("rina", [{"name": "Rena", "member_id": "a"}, {"name": "Rino", "member_id": "b"}]) is None
    )


def test_spoken_confirmation_in_each_language():
    assert greeting("Sunita", "hi-Latn-IN") == "Namaste Sunita ji."
    assert greeting("Sunita", "hi-IN") == "नमस्ते Sunita जी।"
    assert greeting("Sunita", "en-IN") == "Hello Sunita."
    assert "Sunita, Ravi, Aarav" in not_found("Priya", FAMILY, "hi-Latn-IN")
