declare function print(value: unknown): void;

const arr = [1, 2, 3];
let i = 0;
while (i < arr.length) {
  print(arr[i]);
  i = i + 1;
}
