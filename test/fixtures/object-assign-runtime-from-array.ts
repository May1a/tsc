declare function print(value: unknown): void;

const target: { [key: string]: unknown } = {};
const arr: any = ["zero"];
arr["name"] = "named";

Object.assign(target, arr);

print(target["0"]);
print(target.name);
print(Object.hasOwn(target, "length"));
