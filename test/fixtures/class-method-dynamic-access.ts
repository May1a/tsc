declare function print(value: unknown): void;

// Every instance method is on its class's prototype, so a call that reads the method off the
// receiver through a computed key finds it.
class Shape {
  area(): number {
    return 1;
  }
  name(): string {
    return "shape";
  }
}

class Square extends Shape {
  override area(): number {
    return 4;
  }
}

const shape = new Shape();
print(shape["area"]());
print(shape["name"]());

const key = "name";
const square = new Square();
print(square[key]());
print(square["area"]());

class Point {
  x = 1;
}
const point = new Point();
print(point.hasOwnProperty("x"));
print(point.hasOwnProperty("y"));
