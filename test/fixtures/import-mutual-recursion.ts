import { isEven } from "./cross-module-even.js";

declare function print(value: unknown): void;

print(isEven(4));
