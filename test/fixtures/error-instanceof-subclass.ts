declare function print(value: unknown): void;

const t = new TypeError("x");
print(t instanceof TypeError);
print(t instanceof Error);
print(t instanceof RangeError);

const e = new Error("plain");
print(e instanceof TypeError);
print(e instanceof Error);
