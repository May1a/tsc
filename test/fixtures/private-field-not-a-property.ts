declare function print(value: unknown): void;

// Private fields are not properties, so key enumeration and JSON never see them.
class C {
  #x = 1;
  y = 2;
  getX() { return this.#x; }
}
const c = new C();
const keys = Object.keys(c);
print(keys.length);
print(JSON.stringify(c));
print(c.getX());
