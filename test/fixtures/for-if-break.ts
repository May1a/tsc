declare function print(value: unknown): void;

for (let i = 0; i < 5; i = i + 1) {
  if (i === 3) {
    break;
  }
  print(i);
}
