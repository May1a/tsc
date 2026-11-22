declare function print(value: unknown): void;

const orig = [1, 2, 3];
const rev = orig.toReversed();
print(orig.join(","));
print(rev.join(","));
