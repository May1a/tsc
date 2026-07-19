declare function print(value: unknown): void;

const iterable = {
  [Symbol.iterator]() {
    return {
      index: 0,
      next() {
        let index = Number(this.index);
        this.index = index + 1;
        if (index < 8) {
          return { value: index, done: false };
        }
        return { value: undefined, done: true };
      }
    };
  }
};

// Held across the whole loop: must survive every collection cycle.
const keep: unknown[] = [1, ...iterable, 10];

// Consumption loops over a generic iterable: each round spreads into a fresh
// destination array, leaving transient iterator results and arrays for the
// collector under a constrained heap.
let count = 0;
for (let round = 0; round < 4000; round = round + 1) {
  const values: unknown[] = [1, ...iterable, 10];
  count = count + values.length;
}
print(count);
print(keep.length);
print(keep[0]);
print(keep[9]);
