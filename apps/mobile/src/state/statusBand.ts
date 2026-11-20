// Installed iPhone web app: is a dark header (Home's hero) under the status bar right now?
// iOS draws the clock and battery in white over a home-screen web app. Over a dark header that reads well and the
// header runs under the notch / Dynamic Island like a native app; over the cream screens it wouldn't, so the page
// fades in a band behind them (public/index.html, toggled from the root layout). Native builds don't use this.
import { create } from "zustand";

type StatusBandState = {
  /** True while Home's hero covers the status bar area (Home at or near the top). */
  heroUnder: boolean;
  setHeroUnder: (heroUnder: boolean) => void;
};

export const useStatusBand = create<StatusBandState>((set) => ({
  heroUnder: true,
  setHeroUnder: (heroUnder) => set((s) => (s.heroUnder === heroUnder ? s : { heroUnder })),
}));

/** Whether the band should show: light theme, unless Home's hero is what's under the status bar. */
export function statusBandOn(scheme: "light" | "dark", pathname: string, heroUnder: boolean): boolean {
  if (scheme === "dark") return false;
  return !(pathname === "/" && heroUnder);
}
