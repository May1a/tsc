declare function print(value: unknown): void;

const values: unknown[] = [1, 2, 3];

try {
  values.forEach((value) => {
    if (value === 2) {
      throw "callback";
    }
    print(value);
  });
  print("unreachable");
} catch (error) {
  print(error);
}
