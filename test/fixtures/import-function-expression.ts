import { add } from "./exported-add-function.js";

declare function print(value: unknown): void;

print(add(1, 2));
