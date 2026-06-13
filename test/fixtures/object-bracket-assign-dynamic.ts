declare function print(value: unknown): void;

const obj: { [key: string]: unknown } = { seed: "s" };
const k = "dyn";
obj[k] = "v1";
print(obj[k]);

obj[k + "2"] = "v2";
print(obj["dyn2"]);

obj["nul"] = null;
obj["nul"] ??= "filled";
print(obj["nul"]);

obj["kept"] = "orig";
obj["kept"] ??= "ignored";
print(obj["kept"]);

obj[10] = "ten";
print(obj["10"]);
