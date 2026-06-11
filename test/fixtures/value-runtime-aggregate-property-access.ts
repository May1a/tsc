declare function print(value: unknown): void;

const obj: { value?: unknown } = { value: "object" };
const arr: unknown[] = ["array"];
const wrapper: { obj?: unknown; arr?: unknown } = {};
wrapper.obj = obj;
wrapper.arr = arr;

const boxedObj: any = wrapper.obj;
const boxedArr: any = wrapper.arr;

print(boxedObj.value);
print(boxedObj["value"]);
print(boxedArr[0]);
print(boxedArr.length);
