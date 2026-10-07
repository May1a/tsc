declare function print(value: unknown): void;

// A generator method needs a suspendable frame, which the runtime has no representation for, and
// iterating the result needs the iterator protocol driven from the loop. Both are runtime breadth.
const o = {
  *[Symbol.iterator](): Generator<number> {
    yield 1;
  }
};

for (const v of o) {
  print(v);
}
