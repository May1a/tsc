// @ts-nocheck
declare function print(value: unknown): void;

try {
  throw {};
} catch ({ value = 9 }) {
  print(value);
}
