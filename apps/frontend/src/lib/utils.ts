import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function range(
  start: number,
  stop?: number,
  step: number = 1
): number[] {
  // If only one argument provided, treat it as stop value
  if (typeof stop === "undefined") {
    stop = start;
    start = 0;
  }

  // Handle invalid step
  if (step === 0) {
    throw new Error("Step cannot be zero");
  }

  // Calculate length of range
  const length = Math.max(Math.ceil((stop - start) / step), 0);

  // Create and fill array
  return Array.from({ length }, (_, i) => start + i * step);
}
