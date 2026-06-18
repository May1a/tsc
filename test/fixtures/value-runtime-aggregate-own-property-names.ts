declare function print(value: unknown): void;

const obj: Record<string, unknown> = { visible: "yes" };
Object.defineProperty(obj, "hidden", { value: "secret", enumerable: false, writable: true, configurable: true });
const wrapper: { obj?: unknown; arr?: unknown } = {};
wrapper.obj = obj;
const boxedObj: any = wrapper.obj;
const objNames: unknown[] = Object.getOwnPropertyNames(boxedObj);
print(objNames.length);
print(objNames[0]);
print(objNames[1]);

const arr: unknown[] = ["a", , "c"];
wrapper.arr = arr;
const boxedArr: any = wrapper.arr;
const arrNames: unknown[] = Object.getOwnPropertyNames(boxedArr);
print(arrNames.length);
print(arrNames[0]);
print(arrNames[1]);
print(arrNames[2]);
