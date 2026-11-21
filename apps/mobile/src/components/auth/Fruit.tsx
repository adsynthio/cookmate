// One fruit sticker (art in fruitArt.ts): hard shadow, white sticker edge, then the drawing in flat colour and ink.
import { memo } from "react";
import Svg, { G, Path } from "react-native-svg";

import { FRUIT_ART, INK, SHADOW_OFFSET, silhouette, STICKER_EDGE, type ArtShape, type FruitKind } from "./fruitArt";

function edge(shapes: ArtShape[], color: string, keyPrefix: string) {
  return shapes.map((s, i) =>
    "fill" in s ? (
      <Path key={`${keyPrefix}${i}`} d={s.d} fill={color} stroke={color} strokeWidth={STICKER_EDGE * 2} strokeLinejoin="round" />
    ) : (
      <Path key={`${keyPrefix}${i}`} d={s.d} fill="none" stroke={color} strokeWidth={s.width + STICKER_EDGE * 2} strokeLinecap="round" strokeLinejoin="round" />
    ),
  );
}

export const Fruit = memo(function Fruit({ kind, size }: { kind: FruitKind; size: number }) {
  const art = FRUIT_ART[kind];
  const cut = silhouette(art);
  return (
    <Svg width={size} height={size} viewBox="-10 -10 120 120" accessible={false} pointerEvents="none">
      <G x={SHADOW_OFFSET[0]} y={SHADOW_OFFSET[1]} opacity={0.22}>
        {edge(cut, INK, "s")}
      </G>
      {edge(cut, "#FFFFFF", "w")}
      {art.map((s, i) =>
        "fill" in s ? (
          <Path
            key={`a${i}`}
            d={s.d}
            fill={s.fill}
            opacity={s.opacity}
            stroke={s.outline ? INK : undefined}
            strokeWidth={s.outline ? 2.6 : undefined}
            strokeLinejoin="round"
          />
        ) : (
          <G key={`a${i}`}>
            {s.outline ? <Path d={s.d} fill="none" stroke={INK} strokeWidth={s.width + 2.6} strokeLinecap="round" /> : null}
            <Path d={s.d} fill="none" stroke={s.stroke} strokeWidth={s.width} strokeLinecap="round" opacity={s.opacity} />
          </G>
        ),
      )}
    </Svg>
  );
});
