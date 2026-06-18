declare function print(value: unknown): void;

const obj: { value?: unknown } = { value: "object" };
const arr: unknown[] = ["zero", "one"];
const wrapper: { obj?: unknown; arr?: unknown } = {};
wrapper.obj = obj;
wrapper.arr = arr;

const boxedObj: any = wrapper.obj;
const boxedArr: any = wrapper.arr;
const objDesc = Object.getOwnPropertyDescriptor(boxedObj, "value")!;
const arrDesc = Object.getOwnPropertyDescriptor(boxedArr, "0")!;
const lengthDesc = Object.getOwnPropertyDescriptor(boxedArr, "length")!;

print(objDesc.value);
print(objDesc.enumerable);
print(arrDesc.value);
print(arrDesc.configurable);
print(lengthDesc.value);
print(lengthDesc.enumerable);
