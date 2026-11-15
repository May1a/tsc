declare function print(value: unknown): void;

// An array pattern in a catch clause runs the iterator protocol on the thrown value: it closes an
// iterator it does not exhaust, applies defaults, and throws a TypeError for a value that is not
// iterable.
let returnCalls = 0;
const endless = {
  [Symbol.iterator]() {
    return {
      next() { return { value: null, done: false }; },
      return() { returnCalls += 1; return {}; }
    };
  }
};
try {
  throw endless;
} catch ([first]: any) {
  print(first);
  print(returnCalls);
}

try {
  throw [1, 2, 3];
} catch ([a, , c = 9, d = 4]: any) {
  print(a);
  print(c);
  print(d);
}

try {
  try {
    throw 5;
  } catch ([x]: any) {
    print(x);
  }
} catch (error: any) {
  print(error.name);
}
