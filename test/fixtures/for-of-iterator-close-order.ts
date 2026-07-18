declare function print(value: unknown): void;

function makeIterable() {
  return {
    [Symbol.iterator]() {
      return {
        next() {
          return { value: 1, done: false };
        },
        return() {
          print("close");
          return { value: undefined, done: true };
        }
      };
    }
  };
}

try {
  for (const value of makeIterable()) {
    print(value);
    break;
  }
} finally {
  print("finally");
}

for (const item of makeIterable()) {
  try {
    print(item);
    break;
  } finally {
    print("inner-finally");
  }
}
