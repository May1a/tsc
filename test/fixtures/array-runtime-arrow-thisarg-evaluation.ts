declare function print(value: unknown): void;

function receiver(): unknown {
  print("receiver");
  return { factor: 9 };
}

const values: unknown[] = [1, 2];
const mapped = values.map((value) => value, receiver());
print(mapped.length);
