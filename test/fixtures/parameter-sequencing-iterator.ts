declare function print(value: unknown): void;
const iterable = {
  [Symbol.iterator]() {
    return {
      next() {
        print("next");
        return { value: 7, done: false };
      },
      return() {
        print("close");
        return { done: true };
      }
    };
  }
};
function later() {
  print("later");
  return 9;
}
function consume([x]: any, y = later()) {
  print(x);
  print(y);
}
consume(iterable);
