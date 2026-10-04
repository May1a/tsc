declare function print(value: unknown): void;

enum E {
  A,
  B
}
print(E.A);
print(E[0]);
