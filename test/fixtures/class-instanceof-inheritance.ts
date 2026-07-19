declare function print(value: unknown): void;

class C {}
class D extends C {}

print(new D() instanceof D);
print(new D() instanceof C);
print(new C() instanceof D);

function makeD() {
  return new D();
}
const nested = makeD();
print(nested instanceof D);
print(nested instanceof C);
