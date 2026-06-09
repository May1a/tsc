declare function print(value: unknown): void;

const proto: { inherited?: unknown } = { inherited: "proto" };
const obj: { visible?: unknown; hidden?: unknown; removed?: unknown; inherited?: unknown } = Object.create(proto);
obj.visible = "yes";
obj.removed = "gone";
Object.defineProperty(obj, "hidden", { value: "secret", enumerable: false, writable: true, configurable: true });
delete obj.removed;

const keys: unknown[] = Object.keys(obj);
print(keys.length);
print(keys[0]);
print(keys[1]);
