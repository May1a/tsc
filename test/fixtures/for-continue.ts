declare function print(value: unknown): void;

for (let i = 0; i < 3; i = i + 1) {
  if (i === 1) {
    continue;
  }

  print(i);
}
