declare function print(value: unknown): void;
class Base {
  get toString() { print('get'); return function () { return 'inherited'; }; }
}
class Child extends Base {}
const c = new Child();
print(String(c));
class Throwing { get toString() { throw 'lookup failure'; } }
try { print(String(new Throwing())); } catch (e) { print(e); }
