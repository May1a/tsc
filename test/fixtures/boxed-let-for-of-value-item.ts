declare function print(value: unknown): void;

const a = [1, "x"];
for (let v of a) {
  v = 5;
  print(v);
}
