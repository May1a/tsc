declare function print(value: unknown): void;

if (true) {
  const unsupported = new Date();
  print(unsupported);
}
