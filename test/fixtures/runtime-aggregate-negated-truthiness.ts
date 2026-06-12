declare function print(value: unknown): void;

const obj: { value?: unknown } = {};
const arr: unknown[] = [];
if (!obj) { print("object false"); }
if (!arr) { print("array false"); }
print("done");
