declare function print(value: unknown): void;

// ||= on a plain boxed binding: assigns only when the current value is falsy.
let a: number | boolean = 0;
a ||= 42;
print(a); // 42

let b: number | boolean = 1;
b ||= 99;
print(b); // 1 — truthy, no assignment

let c: boolean = false;
c ||= true;
print(c); // true
