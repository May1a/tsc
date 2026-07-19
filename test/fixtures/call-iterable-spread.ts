declare function print(value: unknown): void;

function show(a: number, b: number, c: number, d: number): void {
  print(a);
  print(b);
  print(c);
  print(d);
}

const iterable = {
  [Symbol.iterator]() {
    return {
      index: 0,
      next() {
        let index = Number(this.index);
        this.index = index + 1;
        if (index < 2) {
          return { value: index + 2, done: false };
        }
        return { value: undefined, done: true };
      }
    };
  }
};

show(1, ...iterable, 4);
