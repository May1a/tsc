declare function print(value: unknown): void;

if (false) print("then"); else function f(): void {
  print("unreachable");
}
