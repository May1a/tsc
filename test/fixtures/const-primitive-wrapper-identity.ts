declare function print(value: unknown): void;

// A const holding a primitive wrapper is one object, read from its slot.
const w = new Number(1);
print(w === w);
print(w.valueOf());
const s = new String("ab");
print(s.toString());
print(s.length);
const b = new Boolean(false);
print(b.valueOf());
