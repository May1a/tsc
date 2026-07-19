declare function print(value: unknown): void;

function consume([first, second = 20]: any): void {
  print(first);
  print(second);
}

const iterable = {
  [Symbol.iterator]() {
    return {
      index: 0,
      next() {
        let index = Number(this.index);
        this.index = index + 1;
        if (index === 0) {
          return { value: 10, done: false };
        }
        return { value: undefined, done: true };
      }
    };
  }
};

consume(iterable);
