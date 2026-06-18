declare function print(value: unknown): void;

const obj: { value?: unknown } = { value: "old" };
const arr: unknown[] = ["zero", "one"];
const wrapper: { obj?: unknown; arr?: unknown } = {};
wrapper.obj = obj;
wrapper.arr = arr;

const boxedObj: any = wrapper.obj;
const boxedArr: any = wrapper.arr;

delete boxedObj.value;
delete boxedArr[0];

print(obj.value);
print(arr[0]);
print(arr[1]);
const objKeys: unknown[] = Object.keys(obj);
const arrKeys: unknown[] = Object.keys(arr);
print(objKeys.length);
print(arrKeys.length);
