import { createContext, useContext, type ReactNode } from "react";
import { useColorScheme } from "react-native";

import { palette, type ColorScheme, type Colors } from "./tokens";

type Theme = { scheme: ColorScheme; colors: Colors };

const ThemeContext = createContext<Theme>({ scheme: "light", colors: palette.light });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme: ColorScheme = useColorScheme() === "dark" ? "dark" : "light";
  return (
    <ThemeContext.Provider value={{ scheme, colors: palette[scheme] }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
