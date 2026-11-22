declare function print(value: unknown): void;

const orig = [1, 2, 3, 4];
const spliced = orig.toSpliced(1, 2, 20, 30, 40);
print(orig.join(","));
print(spliced.join(","));
