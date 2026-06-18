declare function print(value: unknown): void;

const proto: { inherited?: unknown } = { inherited: "no" };
const obj: { visible?: unknown; hidden?: unknown; inherited?: unknown } = Object.create(proto);
obj.visible = "yes";
Object.defineProperty(obj, "hidden", { value: "hidden", writable: true, enumerable: false, configurable: true });

print(obj.hasOwnProperty("visible"));
print(obj.hasOwnProperty("inherited"));
print(obj.propertyIsEnumerable("visible"));
print(obj.propertyIsEnumerable("hidden"));
