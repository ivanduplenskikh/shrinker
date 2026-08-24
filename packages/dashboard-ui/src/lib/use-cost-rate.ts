import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "shrinker.inputCostPerMillionTokens";

function readStoredRate(): number | undefined {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === null) return undefined;
    const parsed = Number(stored);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function useCostRate(defaultRate: number): [number, (next: number) => void] {
  const [rate, setRate] = useState(() => readStoredRate() ?? defaultRate);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(rate));
    } catch {
      // Ignore private-mode / disabled storage.
    }
  }, [rate]);

  const update = useCallback((next: number) => {
    if (!Number.isFinite(next) || next < 0) return;
    setRate(next);
  }, []);

  return [rate, update];
}
