declare function print(value: unknown): void;

function next() {
  return 2;
}

let x = 1;
x = 3;
const arr = [x, next()];
print(arr[1]);
