declare function print(value: unknown): void;

function makeCounter() {
  let count = 0;
  return () => {
    count += 1;
    return count;
  };
}

const first = makeCounter();
const second = makeCounter();
first();
first();
second();
print(first());
print(second());
