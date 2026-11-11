"""Switch speaker on a shared phone (KIT-083, VOICE-13): "Main Sunita hoon", "मैं सुनीता हूँ", "I'm Sunita".

The name is matched against the household's members from the context packet, in either script, so
Sarvam returning Devanagari for a name stored in Latin letters (or the other way round) still works.
Switching never writes anything: it only changes whose taste and voice settings the agent uses.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Any

_INTRO = [
    # Hinglish: main / mai / mein Sunita hoon / hun / hu, optionally "bol rahi/raha"
    re.compile(
        r"^(?:main|mai|mein|me)\s+(?P<name>[a-z]+)(?:\s+ji)?\s+(?:bol\s+rah[ia]\s+)?(?:hoon|hun|hu|hoo)\b"
    ),
    # English
    re.compile(r"^(?:i\s*am|i'm|im|this\s+is|it's|its)\s+(?P<name>[a-z]+)\b"),
    # Hindi
    re.compile(r"^(?:मैं|मै|में)\s+(?P<name>[ऀ-ॿ]+?)(?:\s+जी)?\s+(?:बोल\s+रह[ीा]\s+)?(?:हूँ|हूं|हु|हूँ)"),
]
_FILLER = re.compile(r"^(?:hello|helo|hi|namaste|नमस्ते|haan|हाँ|arre|अरे|ji|जी)[\s,!.]+")
_NOT_NAMES = {
    "ready",
    "done",
    "here",
    "back",
    "busy",
    "theek",
    "thik",
    "fine",
    "ok",
    "okay",
    "tayyar",
    "taiyar",
    "aa",
    "aayi",
    "aaya",
}

# Rough Devanagari -> Latin for matching names only (not for display).
_DEV = {
    "अ": "a",
    "आ": "a",
    "इ": "i",
    "ई": "i",
    "उ": "u",
    "ऊ": "u",
    "ए": "e",
    "ऐ": "ai",
    "ओ": "o",
    "औ": "au",
    "ऋ": "ri",
    "ा": "a",
    "ि": "i",
    "ी": "i",
    "ु": "u",
    "ू": "u",
    "े": "e",
    "ै": "ai",
    "ो": "o",
    "ौ": "au",
    "ृ": "ri",
    "क": "k",
    "ख": "kh",
    "ग": "g",
    "घ": "gh",
    "च": "ch",
    "छ": "chh",
    "ज": "j",
    "झ": "jh",
    "ट": "t",
    "ठ": "th",
    "ड": "d",
    "ढ": "dh",
    "ण": "n",
    "त": "t",
    "थ": "th",
    "द": "d",
    "ध": "dh",
    "न": "n",
    "प": "p",
    "फ": "f",
    "ब": "b",
    "भ": "bh",
    "म": "m",
    "य": "y",
    "र": "r",
    "ल": "l",
    "व": "v",
    "श": "sh",
    "ष": "sh",
    "स": "s",
    "ह": "h",
    "ं": "n",
    "ँ": "n",
    "ः": "h",
    "़": "",
}
_CONSONANTS = set("कखगघचछजझटठडढणतथदधनपफबभमयरलवशषसह")
_MATRAS = set("ािीुूेैोौृ्")


def _dev_to_latin(text: str) -> str:
    out: list[str] = []
    for i, ch in enumerate(text):
        if ch == "्":
            continue
        out.append(_DEV.get(ch, ch))
        nxt = text[i + 1] if i + 1 < len(text) else ""
        # Inherent "a" after a consonant, except before a matra/virama or at the end of the word.
        if ch in _CONSONANTS and nxt and nxt not in _MATRAS and nxt in _CONSONANTS:
            out.append("a")
    return "".join(out)


def name_key(name: str) -> str:
    """A loose spelling key: 'Sunita', 'Suneeta' and 'सुनीता' share one."""
    s = unicodedata.normalize("NFC", name.strip().lower())
    if re.search(r"[ऀ-ॿ]", s):
        s = _dev_to_latin(s)
    s = re.sub(r"[^a-z]", "", s)
    for a, b in (("ee", "i"), ("oo", "u"), ("aa", "a"), ("w", "v"), ("ph", "f"), ("z", "j"), ("y", "i")):
        s = s.replace(a, b)
    s = re.sub(r"(.)\1+", r"\1", s)
    return s.rstrip("a") or s


def parse_intro(utterance: str) -> str | None:
    """The name in a self-introduction, or None when the utterance isn't one."""
    text = unicodedata.normalize("NFC", utterance.strip().lower())
    text = re.sub(r"[।.!?,]+$", "", text)
    text = _FILLER.sub("", text)
    for pattern in _INTRO:
        m = pattern.search(text)
        if m:
            name = m.group("name")
            return None if name in _NOT_NAMES else name
    return None


def _distance(a: str, b: str) -> int:
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def find_member(name: str, members: list[dict[str, Any]]) -> dict[str, Any] | None:
    """The one member this name means, or None (no match, or two equally close)."""
    key = name_key(name)
    if not key:
        return None
    scored = []
    for m in members:
        other = name_key(str(m.get("name") or m.get("display_name") or ""))
        if not other:
            continue
        d = _distance(key, other)
        if d == 0 or (d == 1 and min(len(key), len(other)) >= 4):
            scored.append((d, m))
    scored.sort(key=lambda x: x[0])
    if not scored or (len(scored) > 1 and scored[0][0] == scored[1][0]):
        return None
    return scored[0][1]


def greeting(name: str, language: str) -> str:
    """The spoken confirmation (07_voice_agent_tools.csv: 'Namaste Sunita ji.')."""
    if language.startswith("hi-Latn"):
        return f"Namaste {name} ji."
    if language.startswith("hi"):
        return f"नमस्ते {name} जी।"
    return f"Hello {name}."


def not_found(name: str, members: list[dict[str, Any]], language: str) -> str:
    names = ", ".join(str(m.get("name")) for m in members if m.get("name"))
    if language.startswith("hi") and not language.startswith("hi-Latn"):
        return f"इस घर में {name} नाम नहीं मिला। यहाँ ये लोग हैं: {names}।"
    if language.startswith("hi-Latn"):
        return f"Is ghar mein {name} naam nahi mila. Yahan yeh log hain: {names}."
    return f"I couldn't find {name} in this household. The people here are {names}."
