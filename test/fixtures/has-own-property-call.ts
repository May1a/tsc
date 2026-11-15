declare function print(value: unknown): void;

// `Object.prototype.hasOwnProperty.call` answers for any value. A string owns its length and
// indices, an array its length and present elements, and a class instance its fields but not its
// methods, which live on the prototype.
class Point {
  x = 1;
  norm() { return this.x; }
}
const point = new Point();
const text: any = "ab";
const holes: any = [1, , 3];
function owns(value: any, key: any) {
  return Object.prototype.hasOwnProperty.call(value, key);
}
print(owns(point, "x"));
print(owns(point, "norm"));
print(Object.prototype.hasOwnProperty.call(Point.prototype, "norm"));
print(owns(text, "length"));
print(owns(text, 1));
print(owns(text, 2));
print(owns(holes, "length"));
print(owns(holes, 0));
print(owns(holes, 1));
print(owns(5, "x"));
if (!Object.prototype.hasOwnProperty.call(point, "y")) {
  print("no y");
}

// The key converts before a nullish value throws, and a call statement discards its answer.
let converted = false;
const key: any = { toString() { converted = true; return "x"; } };
try {
  Object.prototype.hasOwnProperty.call(null, key);
} catch (thrown: any) {
  print(thrown.name);
}
print(converted);

// A `new` statement runs the constructor and drops the instance.
let constructed = 0;
class Counter {
  constructor() { constructed += 1; }
}
new Counter();
new Counter();
print(constructed);
