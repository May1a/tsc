declare function print(value: unknown): void;

const o = {
  *[Symbol.iterator]() {
    yield 1;
  }
};
for (const v of o) {
  print(v);
}
