declare function print(value: unknown): void;

const runtime: unknown[] = ["a"];
const fixed = [1, 2];
const out: unknown[] = runtime.concat(fixed, "tail");
print(out.length);
print(out[0]);
print(out[1]);
print(out[2]);
print(out[3]);
