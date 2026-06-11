declare function print(value: unknown): void;

const left: unknown[] = ["a"];
const right: unknown[] = ["b", "c"];
const wrapper: { arr?: unknown } = {};
wrapper.arr = right;
const boxed: any = wrapper.arr;
const combined: unknown[] = left.concat(boxed, "tail");

print(combined.length);
print(combined[0]);
print(combined[1]);
print(combined[2]);
print(combined[3]);
