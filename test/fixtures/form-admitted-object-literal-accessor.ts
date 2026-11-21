declare function print(value: unknown): void;

let backing = 10;
const key = "computed";
const box = {
  _v: 1,
  get value(): number {
    return this._v * 2;
  },
  set value(next: number) {
    this._v = next;
  },
  get [key](): number {
    return backing;
  },
  set [key](next: number) {
    backing = next + 1;
  }
};

print(box.value);
box.value = 5;
print(box.value);
print(box._v);
print(box.computed);
box.computed = 20;
print(box.computed);
const keys = Object.keys(box);
print(keys.join(","));

const copy = { ...box };
print(copy.value);
print(copy.computed);
