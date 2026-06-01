declare function print(value: unknown): void;

let s = "run";
const out = true ? s + "time" : "literal";
print(out);
