declare function print(value: unknown): void;

const values = [1, 2, 3, 4];

for (const value of values) {
  if (value === 2) {
    continue;
  }

  if (value === 4) {
    break;
  }

  print(value);
}

print("done");
