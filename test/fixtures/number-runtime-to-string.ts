declare function print(value: unknown): void;

const n = 255;
print(n.toString());
print(n.toString(16));
print((3.75).toString(16));
print((0.5).toString(2));
print((-2.25).toString(2));
const base = 8;
print((2.625).toString(base));
print(NaN.toString(16));
print(Infinity.toString(16));
