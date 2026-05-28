declare function print(value: unknown): void;

let i = 0;
while (i < 5) {
  if (i === 3) {
    break;
  }

  print(i);
  i = i + 1;
}
