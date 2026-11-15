declare function print(value: unknown): void;

function outer() {
  let n = 0;
  const middle = () => {
    const inner = () => {
      n += 1;
      return n;
    };
    return inner();
  };
  return middle;
}

const run = outer();
print(run());
print(run());
