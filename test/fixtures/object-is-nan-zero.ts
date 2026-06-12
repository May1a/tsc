declare function print(value: unknown): void;

const r1: boolean = Object.is(NaN, NaN);
const r2: boolean = Object.is(0, -0);
const r3: boolean = Object.is(-0, 0);
const r4: boolean = Object.is("hello", "hello");
const r5: boolean = Object.is("hello", "world");
const r6: boolean = Object.is(1, 1);
const r7: boolean = Object.is(1, 2);
print(r1);
print(r2);
print(r3);
print(r4);
print(r5);
print(r6);
print(r7);
