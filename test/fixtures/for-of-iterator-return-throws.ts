declare function print(value: unknown): void;

const breakIterable = {
  [Symbol.iterator]() {
    return {
      next() {
        return { value: 1, done: false };
      },
      return(): { value: undefined; done: boolean } {
        print("close");
        throw "from-return";
      }
    };
  }
};

const throwIterable = {
  [Symbol.iterator]() {
    return {
      next() {
        return { value: 1, done: false };
      },
      return(): { value: undefined; done: boolean } {
        print("close");
        throw "from-return";
      }
    };
  }
};

try {
  for (const a of breakIterable) {
    print(a);
    break;
  }
} catch (error) {
  print(error);
}

try {
  for (const b of throwIterable) {
    print(b);
    throw "from-body";
  }
} catch (error) {
  print(error);
}
