declare function print(value: unknown): void;

let i = 0;
while (i < 3) {
  let j = 0;
  while (j < 3) {
    j = j + 1;
    if (j === 1) {
      continue;
    }
    print(j);
  }
  i = i + 1;
}
