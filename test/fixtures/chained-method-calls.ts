declare function print(value: unknown): void;

// Chained property reads and method calls evaluate each receiver once.
let calls = 0;

function makeBox(value: number) {
  calls += 1;
  return {
    value,
    double() {
      return this.value * 2;
    },
    wrap() {
      return {
        inner: this.value + 1,
        read() {
          return this.inner;
        }
      };
    }
  };
}

print(makeBox(5).double());
print(calls);
print(makeBox(10).wrap().read());
print(calls);

const rows: unknown[] = [[10, 20, 30, 40]];
for (const row of rows) {
  const arr = row as number[];
  print(arr.slice(1).join("-"));
  print(arr.slice(1, 3).reverse().join(":"));
}

function getArray(): unknown {
  calls += 1;
  return [100, 200, 300];
}

print((getArray() as number[])[1]);
print(calls);
