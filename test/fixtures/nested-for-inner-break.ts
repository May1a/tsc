declare function print(value: unknown): void;

for (let i = 0; i < 3; i = i + 1) {
  for (let j = 0; j < 3; j = j + 1) {
    if (j === 1) {
      break;
    }
    print(j);
  }
  print(i);
}
