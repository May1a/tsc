declare function print(value: unknown): void;

const source = {};
try {
  const [value] = source as any;
  print(value);
} catch (error: any) {
  print(error.name);
  print(error.message);
}
