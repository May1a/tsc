declare function print(value: unknown): void;

const proto: { inherited?: unknown } = { inherited: "no" };
const source: { a?: unknown; hidden?: unknown; removed?: unknown; inherited?: unknown } = Object.create(proto);
source.a = "a";
source.removed = "gone";
Object.defineProperty(source, "hidden", { value: "hidden", writable: true, enumerable: false, configurable: true });
delete source.removed;

const second: { a?: unknown; b?: unknown } = { a: "override", b: "b" };
const target: { a?: unknown; b?: unknown; hidden?: unknown; removed?: unknown; inherited?: unknown } = {};
Object.assign(target, source, second);

print(target.a);
print(target.b);
print(target.hidden);
print(target.removed);
print(target.inherited);
