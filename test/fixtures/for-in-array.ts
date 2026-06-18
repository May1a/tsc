declare function print(value: unknown): void;

const a: any[] = [10, 20, 30];
for (const k in a) {
  print(k);
}
