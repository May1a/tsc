declare function print(value: unknown): void;

const obj: { [key: string]: unknown } = {};
const k = "computed";
Object.defineProperty(obj, k, { value: "dv", writable: true, enumerable: true, configurable: true });
print(obj[k]);

Object.defineProperty(obj, k + "2", { value: "dv2", writable: true, enumerable: true, configurable: true });
print(obj["computed2"]);
