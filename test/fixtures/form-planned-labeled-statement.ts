declare function print(value: unknown): void;

outer: for (const a of [1]) {
  for (const b of [2]) {
    break outer;
  }
}
print("done");
