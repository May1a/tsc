declare function print(value: unknown): void;

// ??= on a plain boxed binding: assigns when the current value is null or undefined.
let a: number | null | undefined = null;
a ??= 1;
print(a); // 1

let b: number | null | undefined = 2;
b ??= 99;
print(b); // 2

let c: number | null | undefined = undefined;
c ??= 3;
print(c); // 3
