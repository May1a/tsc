declare function print(value: unknown): void;

function makeInner(): unknown {
  return {
    [Symbol.iterator]() {
      return {
        next() {
          return { value: 22, done: false };
        }
      };
    }
  };
}

function makeThird(): unknown {
  return { c: 33 };
}

const outer = {
  [Symbol.iterator]() {
    return {
      index: 0,
      next() {
        let index = Number(this.index);
        this.index = index + 1;
        if (index === 0) {
          return { value: 11, done: false };
        }
        if (index === 1) {
          return { value: makeInner(), done: false };
        }
        if (index === 2) {
          return { value: makeThird(), done: false };
        }
        return { value: undefined, done: true };
      }
    };
  }
};

const [a, [b], { c }] = outer as any;
print(a);
print(b);
print(c);
