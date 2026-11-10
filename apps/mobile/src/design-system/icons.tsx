// Outline icons from the brand kit: 24 box, 1.75 stroke, round caps and joins, ink or ink-secondary.
// Drawn in code (not images) so they follow the theme, the active state and the text size.
import Svg, { Circle, Path, Rect } from "react-native-svg";

import { useTheme } from "./theme";

export type IconName =
  | "home"
  | "kitchen"
  | "cook"
  | "you"
  | "mic"
  | "plus"
  | "back"
  | "forward"
  | "check"
  | "close"
  | "speaker"
  | "fridge"
  | "freezer"
  | "pantry"
  | "counter";

const STROKE = 1.75;

function shapes(name: IconName) {
  switch (name) {
    case "home":
      return <Path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" />;
    case "kitchen":
    case "fridge":
      return (
        <>
          <Rect x={6} y={3} width={12} height={18} rx={2.5} />
          <Path d="M6 10h12M9 6.5v1.5M9 13v3" />
        </>
      );
    case "freezer":
      return <Path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5" />;
    case "pantry":
      return (
        <>
          <Path d="M7 8h10l-.8 11.2a1 1 0 0 1-1 .8H8.8a1 1 0 0 1-1-.8z" />
          <Path d="M6 5h12v3H6z" />
          <Path d="M10 13h4" />
        </>
      );
    case "counter":
      return <Path d="M3 11h18M5 11v8M19 11v8M8 11V8a4 4 0 0 1 8 0v3" />;
    case "cook":
      return (
        <>
          <Path d="M4 11h16v3a6 6 0 0 1-6 6h-4a6 6 0 0 1-6-6z" />
          <Path d="M2 11h2M20 11h2M9 4.5c0 1.5 1 1.5 1 3M13 4.5c0 1.5 1 1.5 1 3" />
        </>
      );
    case "you":
      return (
        <>
          <Circle cx={12} cy={8.5} r={3.75} />
          <Path d="M4.75 20a7.25 7.25 0 0 1 14.5 0" />
        </>
      );
    case "mic":
      return (
        <>
          <Rect x={9} y={3} width={6} height={11} rx={3} />
          <Path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
        </>
      );
    case "plus":
      return <Path d="M12 5v14M5 12h14" />;
    case "back":
      return <Path d="M15 5l-7 7 7 7" />;
    case "forward":
      return <Path d="M9 5l7 7-7 7" />;
    case "check":
      return <Path d="M5 12.5l4.5 4.5L19 7.5" />;
    case "close":
      return <Path d="M6 6l12 12M18 6 6 18" />;
    case "speaker":
      return <Path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4zM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />;
  }
}

export function Icon({ name, size = 24, color, muted }: { name: IconName; size?: number; color?: string; muted?: boolean }) {
  const { colors } = useTheme();
  const stroke = color ?? (muted ? colors.inkSecondary : colors.ink);
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth={STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessible={false}
    >
      {shapes(name)}
    </Svg>
  );
}
