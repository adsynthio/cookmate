"""Fast-path cooking commands (VOICE-06).

Common Cook-mode commands are matched without the language model, so they answer in under 400 ms,
cost nothing, and keep working offline. Matching covers Hindi (Devanagari), Hinglish and English,
because Sarvam may return either script for code-mixed speech.

Anything that does not match cleanly returns None and goes to Claude.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from typing import Literal

Command = Literal[
    "next",
    "back",
    "repeat",
    "slower",
    "pause",
    "resume",
    "done",
    "timer_set",
    "timer_check",
    "whistle",
]


@dataclass(frozen=True)
class FastPathMatch:
    command: Command
    args: dict[str, object] = field(default_factory=dict)


# Number words people actually say for timers ("das minute", "पाँच मिनट", "fifteen minutes").
_NUMBERS: dict[str, int] = {
    # Hinglish
    "ek": 1,
    "do": 2,
    "teen": 3,
    "char": 4,
    "chaar": 4,
    "paanch": 5,
    "panch": 5,
    "chhe": 6,
    "che": 6,
    "saat": 7,
    "aath": 8,
    "nau": 9,
    "das": 10,
    "dus": 10,
    "barah": 12,
    "baarah": 12,
    "pandrah": 15,
    "pandra": 15,
    "bees": 20,
    "pachchis": 25,
    "pachees": 25,
    "tees": 30,
    "paintalis": 45,
    "chalis": 40,
    "aadha": 0.5,
    "dedh": 1.5,
    "dhai": 2.5,
    # Devanagari
    "एक": 1,
    "दो": 2,
    "तीन": 3,
    "चार": 4,
    "पाँच": 5,
    "पांच": 5,
    "छह": 6,
    "छः": 6,
    "सात": 7,
    "आठ": 8,
    "नौ": 9,
    "दस": 10,
    "बारह": 12,
    "पंद्रह": 15,
    "पन्द्रह": 15,
    "बीस": 20,
    "पच्चीस": 25,
    "तीस": 30,
    "चालीस": 40,
    "पैंतालीस": 45,
    "आधा": 0.5,
    "डेढ़": 1.5,
    "ढाई": 2.5,
    # English
    "one": 1,
    "two": 2,
    "three": 3,
    "four": 4,
    "five": 5,
    "six": 6,
    "seven": 7,
    "eight": 8,
    "nine": 9,
    "ten": 10,
    "twelve": 12,
    "fifteen": 15,
    "twenty": 20,
    "thirty": 30,
    "forty": 40,
    "half": 0.5,
}

_MINUTE_WORDS = r"(?:minute|minutes|min|mins|minat|mint|मिनट)"
_HOUR_WORDS = r"(?:hour|hours|ghanta|ghante|घंटा|घंटे)"
_TIMER_WORDS = r"(?:timer|टाइमर|alarm)"

# Order matters: more specific patterns first. Each pattern must match the WHOLE (normalised) utterance,
# allowing polite filler around it, so "agla step mein kitna namak" is NOT treated as "next".
_FILLER = r"(?:please|plz|ji|jee|zara|jara|bhai|ab|acha|accha|ok|okay|theek hai|haan|जी|ज़रा|अब|अच्छा|हाँ|ठीक है)"

_PATTERNS: list[tuple[Command, str]] = [
    (
        "whistle",
        r"(?:ek |1 |one |एक )?(?:seeti|siti|seetee|whistle|सीटी)(?: (?:hui|ho gayi|aayi|baji|हुई|हो गई|आई|बजी|came|done))?",
    ),
    (
        "timer_check",
        r"(?:kitna|kitne|how much|कितना|कितने) (?:time|samay|der|समय|टाइम|देर) (?:bacha|baaki|baki|left|बचा|बाकी)(?: hai| है)?",
    ),
    (
        "slower",
        r"(?:thoda |thora |थोड़ा )?(?:dheere|dhire|dheeray|slowly|slower|slow|धीरे)(?: (?:bolo|boliye|batao|बोलो|बोलिए|बताओ))?",
    ),
    (
        "repeat",
        r"(?:phir se|fir se|dobara|repeat|again|once more|फिर से|दोबारा)(?: (?:bolo|boliye|batao|बोलो|बोलिए|बताओ|please))?",
    ),
    (
        "back",
        r"(?:pichla|pichhla|peeche|previous|go back|back|पिछला|पीछे)(?: (?:wala|step|वाला))?(?: (?:batao|bolo|बताओ|बोलो))?",
    ),
    ("pause", r"(?:ruko|ruk jao|ruk|rukiye|wait|pause|hold on|stop|रुको|रुक जाओ|रुकिए)"),
    ("resume", r"(?:chalo|chaliye|continue|resume|aage chalo|आगे चलो|चलो|चलिए)"),
    (
        "done",
        r"(?:sab ho gaya|khana ban gaya|ban gaya|finished|all done|we are done|सब हो गया|बन गया|खाना बन गया)",
    ),
    (
        "next",
        r"(?:agla|agle|next|aage|ho gaya|hogaya|done|kar liya|हो गया|अगला|आगे|कर लिया)(?: (?:step|batao|bolo|kya hai|wala|बताओ|बोलो|क्या है|वाला))?",
    ),
]

_COMPILED = [(cmd, re.compile(rf"^(?:{_FILLER} )*{pat}(?: {_FILLER})*$")) for cmd, pat in _PATTERNS]

_TIMER_RE = re.compile(
    rf"(?P<label>.*?)\s*(?P<num>\d+(?:\.\d+)?|{'|'.join(map(re.escape, sorted(_NUMBERS, key=len, reverse=True)))})"
    rf"\s*(?P<unit>{_MINUTE_WORDS}|{_HOUR_WORDS})\s*(?:ka|ki|ke|का|की|के|for)?\s*{_TIMER_WORDS}"
    rf"(?:\s*(?:laga do|lagao|lagado|set karo|set|start|chalu karo|लगा दो|लगाओ|शुरू करो))?$"
)


def normalise(text: str) -> str:
    text = unicodedata.normalize("NFC", text).lower().strip()
    text = re.sub(r"[।,.!?\"'“”‘’]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _parse_number(token: str) -> float | None:
    try:
        return float(token)
    except ValueError:
        value = _NUMBERS.get(token)
        return float(value) if value is not None else None


def _clean_label(raw: str) -> str | None:
    label = re.sub(r"\b(?:ke liye|ka|ki|ke|for|का|की|के|के लिए)\b", " ", raw)
    label = re.sub(r"^\s*(?:please )?(?:set|start|put|laga do|lagao)(?: an?| the)?\b", " ", label)
    label = re.sub(r"^\s*(?:an?|the)\b", " ", label)
    label = re.sub(rf"^(?:{_FILLER} )+", "", label.strip())
    label = re.sub(r"\s+", " ", label).strip()
    return label or None


def match(utterance: str) -> FastPathMatch | None:
    """Return the fast-path command for an utterance, or None to send it to the language model."""
    text = normalise(utterance)
    if not text:
        return None

    timer = _TIMER_RE.match(text)
    if timer:
        number = _parse_number(timer.group("num"))
        if number is not None and number > 0:
            minutes = number * 60 if re.fullmatch(_HOUR_WORDS, timer.group("unit")) else number
            return FastPathMatch(
                "timer_set", {"minutes": minutes, "label": _clean_label(timer.group("label"))}
            )

    for command, pattern in _COMPILED:
        if pattern.match(text):
            return FastPathMatch(command)
    return None
