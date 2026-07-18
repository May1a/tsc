declare function print(value: unknown): void;

const receiverIterable = {
  [Symbol.iterator]() {
    return {
      marker: 7,
      next() {
        return { value: 1, done: false };
      },
      return() {
        print(this.marker);
        return { value: undefined, done: true };
      }
    };
  }
};
for (const receiverValue of receiverIterable) {
  print(receiverValue);
  break;
}

const primitiveResultIterable = {
  [Symbol.iterator]() {
    return {
      next() {
        return { value: 2, done: false };
      },
      return(): any {
        return 1;
      }
    };
  }
};
try {
  for (const primitiveValue of primitiveResultIterable) {
    print(primitiveValue);
    break;
  }
} catch (error: any) {
  print(error.name);
  print(error.message);
}

const noReturnIterable = {
  [Symbol.iterator]() {
    return {
      next() {
        return { value: 3, done: false };
      }
    };
  }
};
try {
  for (const originalValue of noReturnIterable) {
    print(originalValue);
    throw "original";
  }
} catch (error) {
  print(error);
}

function returnThroughClose(): number {
  const throwingReturnIterable = {
    [Symbol.iterator]() {
      return {
        next() {
          return { value: 4, done: false };
        },
        return(): any {
          throw "close-return";
        }
      };
    }
  };
  for (const returnValue of throwingReturnIterable) {
    print(returnValue);
    return 5;
  }
  return 0;
}
try {
  print(returnThroughClose());
} catch (error) {
  print(error);
}
