declare function print(value: unknown): void;

const obj: { value?: unknown } = { value: "object" };
const arr: unknown[] = ["array"];
const wrapper: { obj?: unknown; arr?: unknown } = {};
wrapper.obj = obj;
wrapper.arr = arr;

const boxedObj: any = wrapper.obj;
const boxedArr: any = wrapper.arr;

print(Object.hasOwn(boxedObj, "value"));
print(Array.isArray(boxedObj));
print(Array.isArray(boxedArr));
const keys: unknown[] = Object.keys(boxedObj);
const values: unknown[] = Object.values(boxedArr);
print(keys[0]);
print(values[0]);
