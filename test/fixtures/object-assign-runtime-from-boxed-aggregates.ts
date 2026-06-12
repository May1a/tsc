declare function print(value: unknown): void;

const target: { [key: string]: unknown; a?: unknown; b?: unknown; name?: unknown } = {};
const obj: { a?: unknown } = { a: "object" };
const arr: any = ["zero"];
arr["name"] = "array";
const wrapper: { obj?: unknown; arr?: unknown } = {};
wrapper.obj = obj;
wrapper.arr = arr;
const boxedObj: any = wrapper.obj;
const boxedArr: any = wrapper.arr;

Object.assign(target, boxedObj, boxedArr);

print(target.a);
print(target["0"]);
print(target.name);
