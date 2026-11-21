// A value once it has stopped changing for a moment: a run of taps on Home's chips becomes one request for picks
// instead of one per tap (seen live: 17 AI pick calls in two minutes, often two at once).
import { useEffect, useState } from "react";

export function useSettled<T>(value: T, ms = 500): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return settled;
}
