declare function print(value: unknown): void;

const obj: Record<string, unknown> = { visible: "yes" };
Object.defineProperty(obj, "hidden", { value: "secret", enumerable: false, writable: true, configurable: true });
const wrapper: { obj?: unknown } = {};
wrapper.obj = obj;
const boxedObj: any = wrapper.obj;
const descriptors: any = Object.getOwnPropertyDescriptors(boxedObj);
const visible: any = descriptors.visible;
const hidden: any = descriptors.hidden;
print(visible.value);
print(visible.writable);
print(visible.enumerable);
print(visible.configurable);
print(hidden.value);
print(hidden.enumerable);
