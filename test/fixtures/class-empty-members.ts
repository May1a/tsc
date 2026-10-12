declare function print(value: unknown): void;

// A stray `;` and an index signature are class members that declare nothing at runtime.
class C {
  [key: string]: unknown;
  m() { return 42; };
  b = 42;;
}

const c = new C();
print(c.m());
print(c.b);
