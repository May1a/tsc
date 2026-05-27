declare function print(value: unknown): void;

if (true) {
  const unsupported = { value: 1 };
  print(unsupported);
}
