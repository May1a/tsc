declare function print(value: unknown): void;

const arr = [10, 20, 30];
for (let i = 0; i < 3; i = i + 1) {
  print(arr[i]);
}
