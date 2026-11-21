declare function print(value: unknown): void;

if (true) {
  for (const [c] of "ab") {
    print(c);
  }
}
