declare function print(value: unknown): void;

class C {}

print(new C() instanceof C);
