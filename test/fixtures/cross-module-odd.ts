import { isEven } from "./cross-module-even.js";

export function isOdd(n: number): number {
  if (n === 0) {
    return 0;
  }

  return isEven(n - 1);
}
