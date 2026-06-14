declare function print(value: unknown): void;

class C {}
class D extends C {}

print(new D() instanceof D);
print(new D() instanceof C);
print(new C() instanceof D);
