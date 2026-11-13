// Outline icons: 24 box, 1.75 stroke, round caps and joins, ink or ink-secondary.
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
  | "search"
  | "clock"
  | "users"
  | "cart"
  | "fridge"
  | "freezer"
  | "pantry"
  | "counter"
  | "heart"
  | "checkCircle"
  | "receipt"
  | "image"
  | "camera"
  | "sparkle"
  | "hourglass"
  | "more"
  | "list"
  | "bell"
  | "timer"
  | "alarm"
  | "leaf"
  | "barcode"
  | "flame"
  | "box"
  | "skillet"
  | "edit"
  | "trash"
  | "play"
  | "pause"
  | "bulb"
  | "shield"
  | "undo"
  | "minus"
  | "share"
  | "filter"
  | "eye"
  | "ear"
  | "nose"
  | "hand"
  | "spoon"
  | "warning"
  | "arrowLeft"
  | "arrowRight"
  | "drop"
  | "chilli";

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
    case "search":
      return (
        <>
          <Circle cx={11} cy={11} r={6.5} />
          <Path d="M16 16l4.5 4.5" />
        </>
      );
    case "clock":
      return (
        <>
          <Circle cx={12} cy={12} r={8.5} />
          <Path d="M12 7.5V12l3 2" />
        </>
      );
    case "users":
      return (
        <>
          <Circle cx={9} cy={8.5} r={3.25} />
          <Path d="M3.5 19a5.5 5.5 0 0 1 11 0M15.5 5.5a3 3 0 0 1 0 6M17.5 14.2A5.5 5.5 0 0 1 20.5 19" />
        </>
      );
    case "cart":
      return (
        <>
          <Path d="M3 4h2.2l2 11h10.3l2-8H6.3" />
          <Circle cx={9} cy={19} r={1.4} />
          <Circle cx={17} cy={19} r={1.4} />
        </>
      );
    case "heart":
      return <Path d="M12 19.5s-7.5-4.6-7.5-10.2A4.1 4.1 0 0 1 12 7a4.1 4.1 0 0 1 7.5 2.3c0 5.6-7.5 10.2-7.5 10.2z" />;
    case "checkCircle":
      return (
        <>
          <Circle cx={12} cy={12} r={8.5} />
          <Path d="M8.5 12.2l2.4 2.4 4.6-4.9" />
        </>
      );
    case "receipt":
      return <Path d="M6 3.5h12v17l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4zM9 8h6M9 11.5h6M9 15h3.5" />;
    case "image":
      return (
        <>
          <Path d="M4.5 6a1.5 1.5 0 0 1 1.5-1.5h12A1.5 1.5 0 0 1 19.5 6v12a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 18z" />
          <Path d="M4.5 16l4.2-4.2a1 1 0 0 1 1.4 0l3.4 3.4M13 14.5l1.7-1.7a1 1 0 0 1 1.4 0l3.4 3.4" />
          <Circle cx={15.5} cy={8.7} r={1.4} />
        </>
      );
    case "camera":
      return (
        <>
          <Path d="M4 8.5a1.5 1.5 0 0 1 1.5-1.5h2.3L9.3 5h5.4l1.5 2h2.3A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" />
          <Circle cx={12} cy={12.8} r={3.4} />
        </>
      );
    case "sparkle":
      return <Path d="M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6zM18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />;
    case "hourglass":
      return <Path d="M7 3.5h10M7 20.5h10M8 3.5c0 4.5 4 5.5 4 8.5s-4 4-4 8.5M16 3.5c0 4.5-4 5.5-4 8.5s4 4 4 8.5" />;
    case "more":
      return (
        <>
          <Circle cx={12} cy={5.5} r={0.6} />
          <Circle cx={12} cy={12} r={0.6} />
          <Circle cx={12} cy={18.5} r={0.6} />
        </>
      );
    case "list":
      return <Path d="M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" />;
    case "bell":
      return <Path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5H5zM10 20.5a2 2 0 0 0 4 0" />;
    case "timer":
    case "alarm":
      return (
        <>
          <Circle cx={12} cy={13} r={7.5} />
          <Path d="M12 9.5V13l2.5 1.5M9.5 3h5M12 3v2.5" />
        </>
      );
    case "leaf":
      return <Path d="M5 19c0-8 5-13.5 14.5-14-.5 9.5-6 14.5-14 14zM5 19l7-7" />;
    case "barcode":
      return <Path d="M4 6v12M7 6v12M10.5 6v12M13 6v12M16.5 6v12M20 6v12" />;
    case "flame":
      return <Path d="M12 21a6 6 0 0 1-6-6c0-4 3-5.5 3.5-9.5C12 7 13 9 13 11c1-.5 1.8-1.6 2-3 2 1.8 3 4.2 3 7a6 6 0 0 1-6 6z" />;
    case "box":
      return <Path d="M4 7.5 12 4l8 3.5v9L12 20l-8-3.5zM4 7.5 12 11l8-3.5M12 11v9" />;
    case "skillet":
      return <Path d="M3 11h13v1.5A5.5 5.5 0 0 1 10.5 18h-2A5.5 5.5 0 0 1 3 12.5zM16 11.5h5M7 7.5c0-1 .8-1 .8-2M11 7.5c0-1 .8-1 .8-2" />;
    case "edit":
      return <Path d="M4.5 19.5l1-4L15.8 5.2a2 2 0 0 1 2.9 0l.1.1a2 2 0 0 1 0 2.9L8.5 18.5zM14 7l3 3" />;
    case "trash":
      return <Path d="M5 7h14M10 4h4M7 7l.8 12a1.5 1.5 0 0 0 1.5 1.4h5.4a1.5 1.5 0 0 0 1.5-1.4L17 7M10.5 11v5.5M13.5 11v5.5" />;
    case "play":
      return <Path d="M8 5.5v13l10.5-6.5z" />;
    case "pause":
      return <Path d="M8.5 5.5v13M15.5 5.5v13" />;
    case "bulb":
      return <Path d="M9 17.5h6M10 20.5h4M12 3.5a5.5 5.5 0 0 0-3.2 10c.7.5 1.2 1.3 1.2 2.2v.3h4v-.3c0-.9.5-1.7 1.2-2.2A5.5 5.5 0 0 0 12 3.5z" />;
    case "shield":
      return <Path d="M12 3.5 19 6v5.5c0 4.5-3 7.8-7 9-4-1.2-7-4.5-7-9V6z" />;
    case "undo":
      return <Path d="M8 8.5H15a4.5 4.5 0 0 1 0 9h-5M8 8.5l3-3M8 8.5l3 3" />;
    case "minus":
      return <Path d="M5 12h14" />;
    case "share":
      return (
        <>
          <Circle cx={17.5} cy={5.5} r={2.3} />
          <Circle cx={6.5} cy={12} r={2.3} />
          <Circle cx={17.5} cy={18.5} r={2.3} />
          <Path d="M8.5 10.8l7-4M8.5 13.2l7 4" />
        </>
      );
    case "filter":
      return <Path d="M4 6.5h16M7 12h10M10 17.5h4" />;
    case "eye":
      return (
        <>
          <Path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
          <Circle cx={12} cy={12} r={3} />
        </>
      );
    case "ear":
      return <Path d="M7 9a5 5 0 0 1 10 0c0 3-2.5 4-3.2 6.2-.5 1.6-1.3 3.3-3.3 3.3A2.5 2.5 0 0 1 8 16M10 9.5a2 2 0 0 1 4 0c0 1.2-1.2 1.6-1.6 2.5" />;
    case "nose":
      return <Path d="M5 9c2-1.5 4-1.5 6 0s4 1.5 6 0M5 13.5c2-1.5 4-1.5 6 0s4 1.5 6 0M7 18c1.5-1 3-1 4.5 0s3 1 4.5 0" />;
    case "hand":
      return <Path d="M8 12.5V6a1.5 1.5 0 0 1 3 0v5M11 10.5V4.5a1.5 1.5 0 0 1 3 0v6M14 10.5V6a1.5 1.5 0 0 1 3 0v7.5a7 7 0 0 1-7 7h-.5a6 6 0 0 1-4.6-2.2L3.2 15.5a1.5 1.5 0 0 1 2.3-1.9L8 16" />;
    case "spoon":
      return <Path d="M12 3.5c2.2 0 3.5 2 3.5 4.3S14 12 12 12s-3.5-1.9-3.5-4.2S9.8 3.5 12 3.5zM12 12v8.5" />;
    case "warning":
      return <Path d="M12 4 21 19.5H3zM12 10v4.5M12 17v.3" />;
    case "drop":
      return <Path d="M12 3.5s6 6.4 6 10.5a6 6 0 0 1-12 0c0-4.1 6-10.5 6-10.5z" />;
    case "chilli":
      return <Path d="M15 6c2.5 0 4.5 2 4 5-.8 5-6.5 9-12.5 9.5 3.5-2.5 5-5.5 5.5-9 .3-2.8 1-5.5 3-5.5zM15 6c0-1.5.7-2.5 2-3" />;
    case "arrowLeft":
      return <Path d="M19.5 12h-15M10 6.5 4.5 12l5.5 5.5" />;
    case "arrowRight":
      return <Path d="M4.5 12h15M14 6.5l5.5 5.5-5.5 5.5" />;
    case "speaker":
      return <Path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4zM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />;
  }
}

export function Icon({ name, size = 24, color, muted, fill }: { name: IconName; size?: number; color?: string; muted?: boolean; fill?: string }) {
  const { colors } = useTheme();
  const stroke = color ?? (muted ? colors.inkSecondary : colors.ink);
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ?? "none"}
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
