#!/usr/bin/env python3
"""Compute festival and fast dates (KIT-144) and write content/calendar/<from>_<to>.yaml.

Dev-only: needs `pip install ephem`. CI never runs this; it validates the YAML it writes (tools/content/build.py).
The YAML is the source of truth once written: the culinary lead checks it against a panchang and edits by hand.

  python3 tools/content/festivals.py --from 2026-11-11 --months 12

How dates are worked out (the common "tithi at sunrise" rule, New Delhi sunrise):
  * tithi = (moon longitude - sun longitude) / 12 degrees, 1..30; Shukla 1..15, Krishna 16..30 (30 = amavasya).
  * months are amanta (new moon to new moon), named by the sidereal sign (Lahiri) the sun is in at the new moon:
    sun in Meena -> Chaitra. A month with no solar ingress is adhika and skipped for festivals.
  * a festival falls on the first day whose sunrise tithi is the one wanted; if that tithi never touches a sunrise
    (kshaya), the day on which it begins.
  * Islamic dates depend on moon sighting; they are the expected Indian dates and are marked to confirm.
Some festivals follow other rules (Shivaratri at midnight, Janmashtami at midnight, Karva Chauth at moonrise), so a
date can differ by a day from a printed panchang; every generated row is marked `check: true` for review.
"""

from __future__ import annotations

import argparse
import datetime as dt
import math
from pathlib import Path

import ephem

ROOT = Path(__file__).resolve().parents[2]
DELHI = ("28.6139", "77.2090")
MONTHS = ["chaitra", "vaishakha", "jyeshtha", "ashadha", "shravana", "bhadrapada", "ashvin", "kartika",
          "margashirsha", "pausha", "magha", "phalguna"]

# Ingredient keys from content/catalog/ingredients.yaml.
GRAINS = ["rice", "basmati rice", "poha", "semolina", "broken wheat", "vermicelli", "pearl millet", "sorghum",
          "rolled oats", "puffed rice", "whole wheat flour", "refined flour", "rice flour", "pearl millet flour",
          "maize flour", "cornflour", "finger millet flour", "sorghum flour", "bread", "pav"]
PULSES = ["toor dal", "yellow moong dal", "whole green moong", "masoor dal", "chana dal", "urad dal", "whole black urad",
          "kidney beans", "chickpeas", "black chickpeas", "black eyed peas", "moth beans", "gram flour", "soya chunks",
          "tofu", "papad", "bhujia"]
ANIMAL = ["egg", "chicken", "mutton", "minced mutton", "fish", "prawns"]
TAMASIC = ["onion", "spring onion", "garlic", "ginger garlic paste", "asafoetida"]
VRAT_PREFER = ["fasting", "sabudana", "water chestnut flour", "buckwheat flour", "rock salt", "potato", "sweet potato",
               "fox nuts", "peanuts"]

VRAT = {"avoid": GRAINS + PULSES + ANIMAL + TAMASIC + ["salt", "black salt"], "prefer": VRAT_PREFER,
        "note": "Vrat food: no grains, pulses, onion or garlic; rock salt instead of common salt"}
EKADASHI = {"avoid": GRAINS + PULSES + ANIMAL + TAMASIC, "prefer": VRAT_PREFER,
            "note": "No grains or pulses (rice above all), onion or garlic"}
FESTIVE = {"prefer": ["festive"]}

NORTH = ["DL", "HR", "PB", "RJ", "UP", "MP", "HP", "UK", "CH", "JK", "BR", "JH"]


def ayanamsa(d: ephem.Date) -> float:
    """Lahiri ayanamsa in degrees (linear: 23.853 at J2000, 50.29 arcsec a year)."""
    years = (d - ephem.Date("2000/1/1 12:00")) / 365.25
    return 23.853 + years * 50.29 / 3600


def lons(d: ephem.Date) -> tuple[float, float]:
    s, m = ephem.Sun(d), ephem.Moon(d)
    sl = math.degrees(ephem.Ecliptic(s, epoch=d).lon)
    ml = math.degrees(ephem.Ecliptic(m, epoch=d).lon)
    return sl, ml


def tithi(d: ephem.Date) -> int:
    sl, ml = lons(d)
    return int(((ml - sl) % 360) // 12) + 1


def sidereal_sign(d: ephem.Date) -> int:
    sl, _ = lons(d)
    return int(((sl - ayanamsa(d)) % 360) // 30)  # 0 = Mesha ... 11 = Meena


def sunrise(day: dt.date) -> ephem.Date:
    o = ephem.Observer()
    o.lat, o.lon = DELHI
    o.elevation = 216
    o.pressure = 0
    o.horizon = "-0:34"
    # Local midnight IST = 18:30 UTC the day before.
    o.date = ephem.Date(dt.datetime(day.year, day.month, day.day) - dt.timedelta(hours=5, minutes=30))
    return o.next_rising(ephem.Sun())


def to_ist_date(d: ephem.Date) -> dt.date:
    return (ephem.Date(d).datetime() + dt.timedelta(hours=5, minutes=30)).date()


class Calendar:
    def __init__(self, start: dt.date, end: dt.date) -> None:
        self.start, self.end = start, end
        self.days: list[tuple[dt.date, int, str | None]] = []  # date, sunrise tithi, amanta month (None = adhika)
        months = self._months(start - dt.timedelta(days=45), end + dt.timedelta(days=45))
        d = start - dt.timedelta(days=40)
        while d <= end + dt.timedelta(days=40):
            sr = sunrise(d)
            name = None
            for (a, b, m) in months:
                if a <= sr < b:
                    name = m
                    break
            self.days.append((d, tithi(sr), name))
            d += dt.timedelta(days=1)

    @staticmethod
    def _months(a: dt.date, b: dt.date) -> list[tuple[ephem.Date, ephem.Date, str | None]]:
        news = []
        d = ephem.previous_new_moon(ephem.Date(dt.datetime(a.year, a.month, a.day)))
        while ephem.Date(d).datetime().date() <= b:
            news.append(ephem.Date(d))
            d = ephem.next_new_moon(ephem.Date(d + 1))
        out = []
        for i in range(len(news) - 1):
            s0, s1 = sidereal_sign(news[i]), sidereal_sign(news[i + 1])
            adhika = s0 == s1
            out.append((news[i], news[i + 1], None if adhika else MONTHS[(s0 + 1) % 12]))
        return out

    def find(self, month: str, t: int) -> list[dt.date]:
        """Every day in range when month+tithi falls (normally one per year)."""
        out = []
        for i, (d, td, m) in enumerate(self.days):
            if m != month:
                continue
            prev = self.days[i - 1][1] if i else None
            if td == t and prev != t:
                out.append(d)
            elif prev is not None and td == (t % 30) + 1 and prev == (t - 2) % 30 + 1:
                out.append(self.days[i - 1][0])  # kshaya: the tithi began and ended between two sunrises
        return [d for d in out if self.start <= d <= self.end]

    def every(self, t: int) -> list[tuple[dt.date, str]]:
        out = []
        for i, (d, td, m) in enumerate(self.days):
            prev = self.days[i - 1][1] if i else None
            if td == t and prev != t and self.start <= d <= self.end:
                out.append((d, m or "adhika"))
            elif prev is not None and td == (t % 30) + 1 and prev == (t - 2) % 30 + 1:
                day = self.days[i - 1][0]
                if self.start <= day <= self.end:
                    out.append((day, m or "adhika"))
        return out


def solar_ingress(sign: int, start: dt.date, end: dt.date) -> list[dt.date]:
    """Days (IST) when the sun enters a sidereal sign, e.g. 9 = Makara (Makar Sankranti)."""
    out = []
    d = start
    prev = sidereal_sign(sunrise(d))
    while d <= end:
        d += dt.timedelta(days=1)
        s = sidereal_sign(sunrise(d))
        if s == sign and prev != sign:
            out.append(d)
        prev = s
    return out


def onam(start: dt.date, end: dt.date) -> list[dt.date]:
    """Thiruvonam: moon in Shravana nakshatra (280-293.33 deg sidereal) at sunrise while the sun is in Simha."""
    out, d = [], start
    while d <= end:
        sr = sunrise(d)
        sl, ml = lons(sr)
        moon_sid = (ml - ayanamsa(sr)) % 360
        if sidereal_sign(sr) == 4 and 280 <= moon_sid < 293.3334 and (not out or (d - out[-1]).days > 20):
            out.append(d)
        d += dt.timedelta(days=1)
    return out


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--from", dest="start", default=dt.date.today().isoformat())
    p.add_argument("--months", type=int, default=12)
    a = p.parse_args()
    start = dt.date.fromisoformat(a.start)
    end = start + dt.timedelta(days=round(a.months * 30.44) - 1)
    cal = Calendar(start, end)
    ev: list[dict] = []

    def add(kind: str, name: str, day: dt.date, rules: dict, end_day: dt.date | None = None, regions: list[str] | None = None,
            names: dict | None = None, note: str | None = None) -> None:
        row = {"kind": kind, "name": name, "date": day.isoformat()}
        if end_day:
            row["end"] = end_day.isoformat()
        if names:
            row["names"] = names
        row["regions"] = regions or []
        row["rules"] = rules
        row["check"] = True
        if note:
            row["note"] = note
        ev.append(row)

    for d, m in cal.every(11):
        add("fast", "Ekadashi", d, EKADASHI, names={"hi": "एकादशी", "hi-Latn": "Ekadashi"}, note=f"{m} shukla")
    for d, m in cal.every(26):
        add("fast", "Ekadashi", d, EKADASHI, names={"hi": "एकादशी", "hi-Latn": "Ekadashi"}, note=f"{m} krishna")
    for d in cal.find("chaitra", 1):
        nav = cal.find("chaitra", 9)
        add("fast", "Chaitra Navratri", d, VRAT, end_day=nav[0] if nav else d + dt.timedelta(days=8),
            names={"hi": "चैत्र नवरात्रि", "hi-Latn": "Chaitra Navratri"})
    for d in cal.find("chaitra", 9):
        add("festival", "Ram Navami", d, FESTIVE, names={"hi": "राम नवमी", "hi-Latn": "Ram Navami"})
    for d in cal.find("ashvin", 1):
        nav = cal.find("ashvin", 9)
        add("fast", "Sharad Navratri", d, VRAT, end_day=nav[0] if nav else d + dt.timedelta(days=8),
            names={"hi": "शारदीय नवरात्रि", "hi-Latn": "Sharad Navratri"})
    for d in cal.find("ashvin", 10):
        add("festival", "Dussehra", d, FESTIVE, names={"hi": "दशहरा", "hi-Latn": "Dussehra"})
    for d in cal.find("magha", 29):
        add("fast", "Maha Shivaratri", d, VRAT, names={"hi": "महाशिवरात्रि", "hi-Latn": "Mahashivratri"},
            note="Observed on the night chaturdashi holds at midnight; check")
    for d in cal.find("phalguna", 15):
        add("festival", "Holika Dahan", d, FESTIVE, names={"hi": "होलिका दहन", "hi-Latn": "Holika Dahan"})
        add("festival", "Holi", d + dt.timedelta(days=1), {"prefer": ["festive", "khoya"]},
            names={"hi": "होली", "hi-Latn": "Holi"})
    for d in cal.find("shravana", 23):
        add("fast", "Janmashtami", d, VRAT, names={"hi": "जन्माष्टमी", "hi-Latn": "Janmashtami"},
            note="Ashtami at midnight decides the day; check")
    for d in cal.find("shravana", 15):
        add("festival", "Raksha Bandhan", d, FESTIVE, names={"hi": "रक्षा बंधन", "hi-Latn": "Raksha Bandhan"})
    for d in cal.find("bhadrapada", 4):
        add("festival", "Ganesh Chaturthi", d, FESTIVE, names={"hi": "गणेश चतुर्थी", "hi-Latn": "Ganesh Chaturthi"})
    for d in cal.find("ashvin", 19):
        add("fast", "Karva Chauth", d, {"prefer": ["festive"], "note": "Nirjala fast until moonrise; dinner after"},
            regions=NORTH, names={"hi": "करवा चौथ", "hi-Latn": "Karva Chauth"})
    for d in cal.find("ashvin", 30):
        add("festival", "Diwali", d, FESTIVE, names={"hi": "दीवाली", "hi-Latn": "Diwali"})
    for d in cal.find("kartika", 6):
        add("fast", "Chhath Puja", d, {"avoid": TAMASIC + ANIMAL, "prefer": ["festive", "jaggery", "whole wheat flour"],
            "note": "Satvik food; nirjala fast on the main day"}, end_day=d + dt.timedelta(days=1),
            regions=["BR", "JH", "UP", "DL"], names={"hi": "छठ पूजा", "hi-Latn": "Chhath Puja"})
    for d in cal.find("kartika", 15):
        add("festival", "Guru Nanak Jayanti", d, FESTIVE, names={"hi": "गुरु नानक जयंती", "hi-Latn": "Gurpurab"})
    for d in solar_ingress(9, start - dt.timedelta(days=1), end):
        add("festival", "Makar Sankranti", d, {"prefer": ["festive", "sesame seeds", "jaggery"]},
            names={"hi": "मकर संक्रांति", "hi-Latn": "Makar Sankranti"})
        add("festival", "Pongal", d, {"prefer": ["festive", "rice", "yellow moong dal", "jaggery"]}, regions=["TN", "PY"],
            names={"hi": "पोंगल", "hi-Latn": "Pongal"})
        add("festival", "Lohri", d - dt.timedelta(days=1), {"prefer": ["festive", "sesame seeds", "jaggery", "peanuts"]},
            regions=["PB", "HR", "DL", "HP", "JK", "CH"], names={"hi": "लोहड़ी", "hi-Latn": "Lohri"})
    for d in onam(start, end):
        add("festival", "Onam", d, {"prefer": ["festive", "coconut", "rice"]}, regions=["KL"],
            names={"hi": "ओणम", "hi-Latn": "Onam"})
    for year in range(start.year, end.year + 1):
        d = dt.date(year, 12, 25)
        if start <= d <= end:
            add("festival", "Christmas", d, FESTIVE, names={"hi": "क्रिसमस", "hi-Latn": "Christmas"})

    # Islamic calendar: expected Indian dates (moon sighting decides; usually a day after Saudi Arabia).
    islamic = [
        ("fast", "Ramzan", dt.date(2027, 2, 9), dt.date(2027, 3, 10), {"note": "Sehri before dawn, iftar at sunset", "prefer": ["festive"]},
         {"hi": "रमज़ान", "hi-Latn": "Ramzan"}),
        ("festival", "Eid ul-Fitr", dt.date(2027, 3, 11), None, {"prefer": ["festive", "vermicelli", "milk"]},
         {"hi": "ईद उल-फ़ित्र", "hi-Latn": "Eid ul-Fitr"}),
        ("festival", "Eid ul-Adha", dt.date(2027, 5, 17), None, FESTIVE, {"hi": "ईद उल-अज़हा", "hi-Latn": "Bakrid"}),
    ]
    for kind, name, d, e, rules, names in islamic:
        if start <= d <= end:
            add(kind, name, d, rules, end_day=e, names=names, note="Date depends on moon sighting; confirm")

    ev.sort(key=lambda r: (r["date"], r["name"]))
    out = ROOT / "content" / "calendar" / f"{start.isoformat()}_{end.isoformat()}.yaml"
    out.parent.mkdir(parents=True, exist_ok=True)
    import yaml  # noqa: PLC0415

    header = (
        "# Festivals and fasts (KIT-144), generated by tools/content/festivals.py, then reviewed by hand.\n"
        "# Rows with check: true still need the culinary lead to confirm the date against a panchang.\n"
        "# regions: state codes where it applies ([] = all India). rules.avoid / rules.prefer: catalog ingredient\n"
        "# names or recipe tags. Picks follow a fast's avoid list only for households that say they keep it;\n"
        "# everyone else just sees fitting dishes ranked a little higher.\n"
    )
    out.write_text(header + yaml.safe_dump({"events": ev}, allow_unicode=True, sort_keys=False, width=120), encoding="utf-8")
    print(f"wrote {out.relative_to(ROOT)}: {len(ev)} events")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
