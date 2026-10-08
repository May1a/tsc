declare function print(value: unknown): void;

const row = {
  [Symbol.iterator]() {
    print("inner iterator");
    return {
      next() { print("inner next"); return { value: 1, done: false }; },
      return() { print("inner close"); return { value: 0, done: true }; }
    };
  }
};
const rows = [row, row];
for (const [] of rows) { print("body"); }
const [] = row;
const [value] = row;
print(value);
const outer = {
  [Symbol.iterator]() {
    return {
      next() {
        const throwing = {
          [Symbol.iterator]() {
            return {
              next() { return { value: 1, done: false }; },
              return(): IteratorResult<number> { print("throwing close"); throw "close failed"; }
            };
          }
        };
        return { value: throwing, done: false as const };
      },
      return() { print("outer close"); return { value: undefined, done: true as const }; }
    };
  }
};
try {
  for (const [] of outer) { print("unexpected body"); break; }
} catch (error) { print(error); }

const exhausted = {
  [Symbol.iterator]() {
    return {
      next() { print("exhausted next"); return { value: undefined, done: true as const }; },
      return() { print("unexpected exhausted close"); return { value: undefined, done: true as const }; }
    };
  }
};
const [missing] = exhausted;
print(missing);
const [...rest] = exhausted;
print(rest.length);
