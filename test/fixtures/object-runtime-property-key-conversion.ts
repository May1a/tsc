declare function print(value: unknown): void;

const obj: { "0"?: unknown; "10"?: unknown; true?: unknown; dynamic?: unknown } = {};
const key = "dynamic";
obj[0] = "zero";
obj[10] = "ten";
// @ts-expect-error Runtime property-key conversion intentionally supports boolean literals.
obj[true] = "yes";
obj[key] = "value";

print(obj["0"]);
print(obj["10"]);
print(obj["true"]);
print(obj.dynamic);
