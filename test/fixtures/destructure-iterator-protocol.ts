declare function print(value: unknown): void;

const iterable = {
  [Symbol.iterator]() {
    print("iterator");
    return {
      index: 0,
      next() {
        let index = Number(this.index);
        if (index < 2) {
          this.index = index + 1;
          if (index === 0) {
            print("next-0");
            return { value: 10, done: false };
          }
          print("next-1");
          return { value: 20, done: false };
        }
        print("done");
        return { value: undefined, done: true };
      }
    };
  }
};

const [first, , third, fourth] = iterable;
print(first);
print(third);
print(fourth);