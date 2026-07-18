declare function print(value: unknown): void;

function returnObject(): any {
  try {
    return { value: 42 };
  } finally {
    for (let i = 0; i < 100; i = i + 1) {
      const waste: any = { value: i };
      if (Number(waste.value) < 0) {
        print(waste.value);
      }
    }
  }
}

const iterable = {
  [Symbol.iterator]() {
    return {
      next() {
        return { value: 1, done: false };
      },
      return() {
        for (let i = 0; i < 100; i = i + 1) {
          const waste: any = { value: i };
          if (Number(waste.value) < 0) {
            print(waste.value);
          }
        }
        return { value: undefined, done: true };
      }
    };
  }
};

print(returnObject());
try {
  for (const value of iterable) {
    print(value);
    throw { message: "alive" };
  }
} catch (error: any) {
  print(error.message);
}
