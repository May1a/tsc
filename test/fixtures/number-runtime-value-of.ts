declare function print(value: unknown): void;

// `Number(value)` is the lowered numeric form of `valueOf`.
const n: number = Number("42");
print(n);