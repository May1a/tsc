declare function print(value: unknown): void;

let i = 0;
do {
  print(i);
  i = i + 1;
} while (i < 3);
