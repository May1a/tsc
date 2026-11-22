// `console.log` prints space-separated formatted values matching Node.
console.log();
console.log("hi");
console.log("a", 1, true, false, null, undefined);
console.log(0, -0, 0.1 + 0.2, 1234567, NaN, Infinity, -Infinity);
const nums: unknown[] = [1, 2, 3];
console.log(nums);
const mixed: unknown[] = ["a", "it's", true, null, undefined];
console.log(mixed);
const empty: unknown[] = [];
console.log(empty);
const nested: unknown[] = [1, [2, "x"]];
console.log(nested);
const obj: { a: number; b: string } = { a: 1, b: "ok" };
console.log(obj);
const emptyObj: Record<string, unknown> = {};
console.log(emptyObj);
