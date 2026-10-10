declare function print(value: unknown): void;

// Duplicate declarations lower successfully but fail frontend checking.
print("before");
const n = 1;
const n = 2;
print(n);
