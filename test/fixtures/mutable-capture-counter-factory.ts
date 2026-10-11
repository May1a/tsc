declare function print(value: unknown): void;

function makeCounter() {
  let count = 0;
  return () => {
    count += 1;
    return count;
  };
}

const c = makeCounter();
c();
print(c());
