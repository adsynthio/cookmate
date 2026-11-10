"""Spoken confirmation before any write (VOICE-08).

The language model proposes a write (add pantry items, save a memory, add to list, long timer); the gate
holds it until the user clearly says yes. Enforced in code so a prompt mistake cannot skip it.
"""

from __future__ import annotations

import re
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any, Literal

from .fast_path import normalise

Answer = Literal["yes", "no", "unclear"]

_YES = (
    r"(?:haan|haa|han|ha|hanji|haan ji|ji haan|theek hai|thik hai|sahi hai|kar do|kardo|jod do|daal do|"
    r"bilkul|yes|yeah|yep|ok|okay|sure|correct|right|हाँ|हां|जी हाँ|ठीक है|सही है|कर दो|जोड़ दो|बिल्कुल)"
)
_NO = (
    r"(?:nahi|nahin|na|mat|mat karo|rehne do|cancel|no|nope|don't|dont|wrong|galat|"
    r"नहीं|ना|मत|रहने दो|गलत)"
)
_YES_RE = re.compile(rf"^(?:{_YES})(?: (?:ji|please|जी))?$")
_NO_RE = re.compile(rf"^(?:{_NO})(?: .*)?$")


def classify(utterance: str) -> Answer:
    text = normalise(utterance)
    if _NO_RE.match(text):
        return "no"
    if _YES_RE.match(text):
        return "yes"
    return "unclear"


@dataclass
class PendingWrite:
    tool: str
    summary: str  # what we read back, e.g. "Do kilo aloo aur barah ande jod doon?"
    run: Callable[[], Awaitable[Any]]


class ConfirmationGate:
    def __init__(self) -> None:
        self.pending: PendingWrite | None = None

    def propose(self, tool: str, summary: str, run: Callable[[], Awaitable[Any]]) -> str:
        self.pending = PendingWrite(tool, summary, run)
        return summary

    async def resolve(self, utterance: str) -> tuple[Answer, Any]:
        """Apply or drop the pending write. Returns the answer and the write's result (if applied)."""
        if self.pending is None:
            return "unclear", None
        answer = classify(utterance)
        if answer == "yes":
            pending, self.pending = self.pending, None
            return "yes", await pending.run()
        if answer == "no":
            self.pending = None
        return answer, None
