declare function print(value: unknown): void;

if (true) function f(): void {
  print("unreachable");
}
