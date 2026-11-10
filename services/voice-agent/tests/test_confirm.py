import asyncio

import pytest

from cookmate_voice.confirm import ConfirmationGate, classify


@pytest.mark.parametrize("utterance", ["Haan", "haan ji", "theek hai", "हाँ", "ठीक है", "yes", "ok", "kar do"])
def test_yes(utterance):
    assert classify(utterance) == "yes"


@pytest.mark.parametrize("utterance", ["nahi", "nahi, sirf aloo", "mat karo", "नहीं", "no", "galat"])
def test_no(utterance):
    assert classify(utterance) == "no"


@pytest.mark.parametrize("utterance", ["haan par ande nahi", "kitna namak", "hmm", ""])
def test_unclear(utterance):
    assert classify(utterance) == "unclear"


def test_write_runs_only_after_yes():
    calls = []

    async def write():
        calls.append("added")
        return "ok"

    async def scenario():
        gate = ConfirmationGate()
        gate.propose("add_items", "Do kilo aloo jod doon?", write)
        assert await gate.resolve("hmm") == ("unclear", None)
        assert calls == [] and gate.pending is not None
        assert await gate.resolve("haan") == ("yes", "ok")
        assert calls == ["added"] and gate.pending is None

    asyncio.run(scenario())


def test_no_drops_the_write():
    async def write():
        raise AssertionError("must not run")

    async def scenario():
        gate = ConfirmationGate()
        gate.propose("remember", "Yaad rakhun?", write)
        assert (await gate.resolve("nahi"))[0] == "no"
        assert gate.pending is None

    asyncio.run(scenario())
