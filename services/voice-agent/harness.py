"""Text harness: type what the user would say and see how the agent routes it. No keys or audio needed.

uv run python harness.py
> agla batao
fast_path  next {}
> dal ke liye das minute ka timer laga do
fast_path  timer_set {'minutes': 10.0, 'label': 'dal'}
> tamatar nahi hai
model      (would call Claude with tools)
"""

from __future__ import annotations

import sys

from cookmate_voice.fast_path import match


def route(utterance: str) -> str:
    m = match(utterance)
    if m is not None:
        return f"fast_path  {m.command} {m.args}"
    return "model      (would call Claude with tools)"


def main() -> None:
    if not sys.stdin.isatty():
        for line in sys.stdin:
            print(f"{line.strip():45} -> {route(line)}")
        return
    while True:
        try:
            line = input("> ")
        except EOFError:
            break
        print(route(line))


if __name__ == "__main__":
    main()
