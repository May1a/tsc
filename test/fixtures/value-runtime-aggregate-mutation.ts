declare function print(value: unknown): void;

const obj: { value?: unknown; extra?: unknown } = { value: "old" };
const arr: unknown[] = ["zero", "one", "two"];
const wrapper: { obj?: unknown; arr?: unknown } = {};
wrapper.obj = obj;
wrapper.arr = arr;

const boxedObj: any = wrapper.obj;
const boxedArr: any = wrapper.arr;

boxedObj.value = "next";
boxedObj["extra"] = 42;
boxedArr[1] = "next";
boxedArr.length = 2;

print(obj.value);
print(obj.extra);
print(arr[0]);
print(arr[1]);
print(arr.length);
print(arr[2]);
