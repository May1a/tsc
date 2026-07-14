declare function print(value: unknown): void;

function makeAdder(value: number) {
  return (other: number): number => value + other;
}

const addOne = makeAdder(1);
const addTen = makeAdder(10);
print(addOne(2));
print(addTen(2));
