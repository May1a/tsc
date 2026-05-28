import { isOdd } from "./cross-module-odd.js";

export function isEven(n: number): number {
  if (n === 0) {
    return 1;
  }

  return isOdd(n - 1);
}
