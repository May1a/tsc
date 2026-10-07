declare function print(value: unknown): void;

// The radix is a numeric literal; base 10 is the lowered slice.
print(Number.parseInt("42", 10));
print(Number.parseInt("7"));
