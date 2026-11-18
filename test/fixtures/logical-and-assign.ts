declare function print(value: unknown): void;

// &&= on a plain boxed binding: assigns only when the current value is truthy.
let a: number | boolean = 1;
a &&= 42;
print(a); // 42

let b: number | boolean = 0;
b &&= 99;
print(b); // 0 — falsy, no assignment

let c: boolean = true;
c &&= false;
print(c); // false
