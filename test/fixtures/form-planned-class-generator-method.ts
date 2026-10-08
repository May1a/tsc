declare function print(value: unknown): void;

class C {
  *g(): Generator<number> { yield 1; }
}
print(new C().g());
