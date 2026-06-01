declare function print(value: unknown): void;

function value() {
  return 42;
}

const obj = { x: value() };
print(obj.x);
