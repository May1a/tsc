declare function print(value: unknown): void;

for (let v of [1, 2, 3]) {
  v = v * 2;
  print(v);
}
