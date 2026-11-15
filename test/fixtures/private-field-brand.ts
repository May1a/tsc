declare function print(value: unknown): void;

// A private field is an element only instances of its class hold: any other receiver throws a TypeError.
class C {
  #x = 1;
  y = 2;
  static read(o: any) { return o.#x; }
  static write(o: any, v: number) { o.#x = v; }
  bump() { this.#x = this.#x + 1; return this.#x; }
}
const c = new C();
print(c.bump());
C.write(c, 10);
print(C.read(c));
for (const target of [{}, 5, null, [1]]) {
  try {
    C.read(target);
    print("read");
  } catch (error: any) {
    print(error.name);
  }
  try {
    C.write(target, 1);
    print("wrote");
  } catch (error: any) {
    print(error.name);
  }
}
print(JSON.stringify(c));
