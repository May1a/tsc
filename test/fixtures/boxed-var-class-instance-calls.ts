declare function print(value: unknown): void;

// A `var` holding a class instance is a boxed binding: calls on it read methods off the receiver.
class Square {
  area(): number {
    return 4;
  }
  side = 2;
}

var held = new Square();
print(held.area());
print(held["area"]());
print(held.hasOwnProperty("side"));
print(held.hasOwnProperty("area"));
