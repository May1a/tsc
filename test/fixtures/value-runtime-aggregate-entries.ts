declare function print(value: unknown): void;

const obj: { a?: unknown; b?: unknown } = { a: "value" };
obj.b = undefined;
const arr: unknown[] = ["zero", undefined, "two"];
const wrapper: { obj?: unknown; arr?: unknown } = {};
wrapper.obj = obj;
wrapper.arr = arr;

const boxedObj: any = wrapper.obj;
const boxedArr: any = wrapper.arr;
const entries: any[] = Object.entries(boxedObj);
const arrEntries: any[] = Object.entries(boxedArr);

print(entries.length);
print(entries[0][0]);
print(entries[0][1]);
print(arrEntries.length);
print(arrEntries[0][0]);
print(arrEntries[1][0]);
print(arrEntries[1][1]);
