declare function print(value: unknown): void;

const numbers = [42, -42, 1.25, -1.25, 0.000001, -0.000001, 0.0000001, 1e20, 1e21, 0, -0];
for (const number of numbers) {
  print(String(number));
}
