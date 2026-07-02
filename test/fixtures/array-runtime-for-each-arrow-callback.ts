declare function print(value: unknown): void;

const arr: unknown[] = [1, 2];
arr.forEach((value) => {
  print(value);
});
print("done");
