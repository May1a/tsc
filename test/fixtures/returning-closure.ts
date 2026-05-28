declare function print(value: unknown): void;

function makeAdder(n: number) {
  return function adder(x: number): number {
    return n + x;
  };
}

const add3 = makeAdder(3);
const result = add3(5);

print(result);
