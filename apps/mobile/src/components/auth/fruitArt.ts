// The fruit and vegetable stickers on the sign-up and log-in screens, as plain shapes on a 100 x 100 board.
// Drawn by hand in the style of a die-cut sticker: flat colour, a warm dark outline, a white sticker edge and a hard
// little shadow (Fruit.tsx draws those two from the shapes marked `outline` or `cut`). Plain data, so a preview can
// be rendered outside the app.

export const INK = "#2A1B12";

export const FRUIT = {
  melon: "#FF4D6A",
  rind: "#2BA84A",
  rindPale: "#D4F5A2",
  mango: "#FFB21E",
  mangoBlush: "#FF7A2F",
  leaf: "#3CB043",
  leafDark: "#1F7A35",
  stem: "#7A4A26",
  lemonRind: "#FFD21F",
  lemonPith: "#FFF8D6",
  lemonFlesh: "#FFE45E",
  chilli: "#F0322A",
  pom: "#C81E45",
  pomPith: "#FFE1D2",
  aril: "#FF3D63",
  tomato: "#FF5532",
  brinjal: "#6A3DB0",
  brinjalLight: "#A27BE3",
  banana: "#FFD93B",
  bananaShade: "#E9B70F",
  carrot: "#FF8A1E",
  carrotLine: "#D9650A",
  orange: "#FF9A1F",
  orangeDark: "#E07A00",
} as const;

/** A filled shape (outlined in ink when `outline`), or a stroke (`width`). `cut` strokes are part of the sticker edge. */
export type ArtShape =
  | { d: string; fill: string; outline?: boolean; opacity?: number }
  | { d: string; stroke: string; width: number; outline?: boolean; cut?: boolean; opacity?: number };

export type FruitKind =
  | "watermelon"
  | "mango"
  | "lemon"
  | "chilli"
  | "pomegranate"
  | "tomato"
  | "brinjal"
  | "banana"
  | "carrot"
  | "orange"
  | "leaf";

const r1 = (n: number) => Math.round(n * 10) / 10;

export function circle(cx: number, cy: number, r: number): string {
  return `M${r1(cx - r)} ${r1(cy)} A${r} ${r} 0 1 0 ${r1(cx + r)} ${r1(cy)} A${r} ${r} 0 1 0 ${r1(cx - r)} ${r1(cy)} Z`;
}

/** An ellipse turned `deg` degrees, as two arcs (no transforms, so every renderer draws it the same). */
export function ellipse(cx: number, cy: number, rx: number, ry: number, deg = 0): string {
  const a = (deg * Math.PI) / 180;
  const dx = rx * Math.cos(a);
  const dy = rx * Math.sin(a);
  return `M${r1(cx - dx)} ${r1(cy - dy)} A${rx} ${ry} ${deg} 1 0 ${r1(cx + dx)} ${r1(cy + dy)} A${rx} ${ry} ${deg} 1 0 ${r1(cx - dx)} ${r1(cy - dy)} Z`;
}

/** A star of `points` points (a tomato's green top), squashed to `squash` of its height. */
export function star(cx: number, cy: number, outer: number, inner: number, points: number, squash = 1, turn = -90): string {
  const out: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = ((turn + (i * 180) / points) * Math.PI) / 180;
    out.push(`${i === 0 ? "M" : "L"}${r1(cx + r * Math.cos(a))} ${r1(cy + r * Math.sin(a) * squash)}`);
  }
  return `${out.join(" ")} Z`;
}

const at = (cx: number, cy: number, r: number, deg: number): [number, number] => [
  r1(cx + r * Math.cos((deg * Math.PI) / 180)),
  r1(cy + r * Math.sin((deg * Math.PI) / 180)),
];

const seed = (cx: number, cy: number, deg: number): ArtShape => ({ d: ellipse(cx, cy, 2.3, 3.8, deg), fill: INK });

const lemonSpokes: ArtShape[] = Array.from({ length: 8 }, (_, i) => {
  const [x, y] = at(50, 50, 29, i * 45 + 22.5);
  return { d: `M50 50 L${x} ${y}`, stroke: FRUIT.lemonPith, width: 2.8 };
});

const arilSpots: [number, number][] = [
  [50, 52],
  ...Array.from({ length: 6 }, (_, i) => at(50, 52, 9.5, i * 60 + 30)),
  ...Array.from({ length: 11 }, (_, i) => at(50, 52, 19.5, i * (360 / 11) + 8)),
];
const arils: ArtShape[] = arilSpots.flatMap(([x, y]): ArtShape[] => [
  { d: circle(x, y, 4.3), fill: FRUIT.aril },
  { d: circle(x - 1.4, y - 1.4, 1.2), fill: "#FFFFFF", opacity: 0.75 },
]);

export const FRUIT_ART: Record<FruitKind, ArtShape[]> = {
  watermelon: [
    { d: "M8 30 A42 42 0 0 0 92 30 Z", fill: FRUIT.rind, outline: true },
    { d: "M14 30 A36 36 0 0 0 86 30 Z", fill: FRUIT.rindPale },
    { d: "M19 30 A31 31 0 0 0 81 30 Z", fill: FRUIT.melon },
    seed(36, 40, -30),
    seed(50, 46, 0),
    seed(64, 40, 30),
    seed(43, 53, -15),
    seed(57, 53, 15),
  ],
  mango: [
    { d: "M50 19 C 50 14 52 10 56 7", stroke: FRUIT.stem, width: 3.6, cut: true, outline: true },
    { d: "M50 18 C 72 14 90 32 87 56 C 84 78 66 91 47 89 C 28 87 15 72 17 55 C 19 42 28 36 33 30 C 38 23 42 19 50 18 Z", fill: FRUIT.mango, outline: true },
    { d: ellipse(67, 41, 13, 9, 35), fill: FRUIT.mangoBlush, opacity: 0.85 },
    { d: ellipse(33, 61, 3.8, 8.5, 20), fill: "#FFFFFF", opacity: 0.55 },
    { d: "M55 9 C 63 1 78 2 86 9 C 77 16 63 17 55 9 Z", fill: FRUIT.leaf, outline: true },
    { d: "M58 9 C 66 8 75 9 83 9", stroke: FRUIT.leafDark, width: 1.6 },
  ],
  lemon: [
    { d: circle(50, 50, 38), fill: FRUIT.lemonRind, outline: true },
    { d: circle(50, 50, 33), fill: FRUIT.lemonPith },
    { d: circle(50, 50, 29), fill: FRUIT.lemonFlesh },
    ...lemonSpokes,
    { d: circle(50, 50, 3.4), fill: FRUIT.lemonPith },
    { d: ellipse(39, 38, 2, 3.4, -40), fill: "#FFFFFF", opacity: 0.8 },
  ],
  chilli: [
    { d: "M29 23 C 27 16 23 12 16 11", stroke: FRUIT.leaf, width: 4.5, cut: true, outline: true },
    { d: "M27 27 C 37 22 47 28 52 39 C 58 54 67 71 84 85 C 63 84 44 70 35 53 C 29 43 24 33 27 27 Z", fill: FRUIT.chilli, outline: true },
    { d: "M36 35 C 42 46 49 58 59 68", stroke: "#FFFFFF", width: 3, opacity: 0.45 },
    { d: "M21 31 C 22 22 32 18 38 24 C 35 30 27 33 21 31 Z", fill: FRUIT.leaf, outline: true },
  ],
  pomegranate: [
    { d: circle(50, 52, 37), fill: FRUIT.pom, outline: true },
    { d: "M43 17 L 41 8 L 47 13 L 50 6 L 53 13 L 59 8 L 57 17 Z", fill: FRUIT.pom, outline: true },
    { d: circle(50, 52, 30.5), fill: FRUIT.pomPith },
    ...arils,
  ],
  tomato: [
    { d: "M50 26 C 71 24 87 38 86 58 C 85 77 69 88 50 88 C 31 88 15 77 14 58 C 13 38 29 24 50 26 Z", fill: FRUIT.tomato, outline: true },
    { d: ellipse(32, 50, 4.5, 9.5, 25), fill: "#FFFFFF", opacity: 0.5 },
    { d: star(50, 30, 17, 6, 5, 0.62), fill: FRUIT.leaf, outline: true },
    { d: "M50 29 C 50 22 52 18 56 15", stroke: FRUIT.leafDark, width: 4, cut: true, outline: true },
  ],
  brinjal: [
    { d: "M49 27 C 51 19 55 13 61 11", stroke: FRUIT.leaf, width: 5, cut: true, outline: true },
    { d: "M46 30 C 62 27 72 43 75 59 C 79 77 70 92 54 92 C 37 92 29 79 29 63 C 29 48 32 33 46 30 Z", fill: FRUIT.brinjal, outline: true },
    { d: "M39 50 C 37 60 38 70 43 79", stroke: FRUIT.brinjalLight, width: 4 },
    { d: "M33 35 C 37 25 51 21 61 29 C 66 33 64 40 59 38 C 55 36 53 41 48 39 C 43 37 39 42 33 35 Z", fill: FRUIT.leaf, outline: true },
  ],
  banana: [
    { d: "M18 30 L 15 21", stroke: FRUIT.stem, width: 5, cut: true, outline: true },
    { d: "M14 34 C 22 66 58 84 89 62 C 90 59 88 56 85 57 C 64 60 36 50 24 30 C 21 26 13 28 14 34 Z", fill: FRUIT.banana, outline: true },
    { d: "M21 43 C 33 61 57 69 80 64", stroke: FRUIT.bananaShade, width: 2.4 },
    { d: circle(87.5, 59.5, 2.6), fill: FRUIT.stem },
  ],
  carrot: [
    { d: "M30 30 C 26 20 22 14 14 10", stroke: FRUIT.leaf, width: 5, cut: true, outline: true },
    { d: "M33 28 C 33 18 36 11 42 6", stroke: FRUIT.leaf, width: 5, cut: true, outline: true },
    { d: "M28 34 C 20 32 13 30 6 32", stroke: FRUIT.leaf, width: 5, cut: true, outline: true },
    { d: "M26 29 C 34 22 45 24 52 31 L 86 84 C 86 87 83 88 80 86 L 27 50 C 20 44 19 35 26 29 Z", fill: FRUIT.carrot, outline: true },
    { d: "M39 45 L 47 41", stroke: FRUIT.carrotLine, width: 2.4 },
    { d: "M55 58 L 62 55", stroke: FRUIT.carrotLine, width: 2.4 },
    { d: "M67 70 L 73 67", stroke: FRUIT.carrotLine, width: 2.4 },
  ],
  orange: [
    { d: circle(50, 55, 34), fill: FRUIT.orange, outline: true },
    { d: ellipse(36, 45, 5, 9, 30), fill: "#FFFFFF", opacity: 0.45 },
    { d: circle(62, 66, 1.6), fill: FRUIT.orangeDark, opacity: 0.6 },
    { d: circle(70, 56, 1.6), fill: FRUIT.orangeDark, opacity: 0.6 },
    { d: circle(56, 76, 1.6), fill: FRUIT.orangeDark, opacity: 0.6 },
    { d: circle(68, 74, 1.6), fill: FRUIT.orangeDark, opacity: 0.6 },
    { d: "M52 23 C 58 10 72 8 81 13 C 75 24 61 27 52 23 Z", fill: FRUIT.leaf, outline: true },
    { d: circle(49.5, 22, 3), fill: FRUIT.stem },
  ],
  leaf: [
    { d: "M18 82 C 16 46 44 20 84 16 C 84 52 58 80 18 82 Z", fill: FRUIT.leaf, outline: true },
    { d: "M20 80 C 38 60 58 40 80 20", stroke: FRUIT.leafDark, width: 2.2 },
    { d: "M38 61 L 35 47", stroke: FRUIT.leafDark, width: 1.8 },
    { d: "M50 49 L 48 35", stroke: FRUIT.leafDark, width: 1.8 },
    { d: "M44 66 L 58 63", stroke: FRUIT.leafDark, width: 1.8 },
    { d: "M58 52 L 70 49", stroke: FRUIT.leafDark, width: 1.8 },
  ],
};

/** Width of the white sticker edge around each shape, in board units. */
export const STICKER_EDGE = 7;
/** How far the hard shadow sits below and right of the sticker. */
export const SHADOW_OFFSET: [number, number] = [2, 3.5];

/** Sticker edge and shadow outline: the outlined fills and the `cut` strokes, fattened by the edge. */
export function silhouette(art: ArtShape[]): ArtShape[] {
  return art.flatMap((s): ArtShape[] => {
    if ("fill" in s) return s.outline ? [s] : [];
    return s.cut ? [s] : [];
  });
}

/** The whole sticker as SVG markup (for previews and tests; the app draws the same shapes with react-native-svg). */
export function stickerSvg(kind: FruitKind, size = 120): string {
  const art = FRUIT_ART[kind];
  const edge = (fill: string) =>
    silhouette(art)
      .map((s) =>
        "fill" in s
          ? `<path d="${s.d}" fill="${fill}" stroke="${fill}" stroke-width="${STICKER_EDGE * 2}" stroke-linejoin="round"/>`
          : `<path d="${s.d}" fill="none" stroke="${fill}" stroke-width="${s.width + STICKER_EDGE * 2}" stroke-linecap="round" stroke-linejoin="round"/>`,
      )
      .join("");
  const body = art
    .map((s) => {
      const o = s.opacity !== undefined ? ` opacity="${s.opacity}"` : "";
      if ("fill" in s) return `<path d="${s.d}" fill="${s.fill}"${s.outline ? ` stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"` : ""}${o}/>`;
      const under = s.outline ? `<path d="${s.d}" fill="none" stroke="${INK}" stroke-width="${s.width + 2.6}" stroke-linecap="round"/>` : "";
      return `${under}<path d="${s.d}" fill="none" stroke="${s.stroke}" stroke-width="${s.width}" stroke-linecap="round"${o}/>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="-10 -10 120 120"><g transform="translate(${SHADOW_OFFSET[0]} ${SHADOW_OFFSET[1]})" opacity="0.22">${edge(INK)}</g>${edge("#FFFFFF")}${body}</svg>`;
}
