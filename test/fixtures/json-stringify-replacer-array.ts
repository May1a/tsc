declare function print(value: unknown): void;

const obj = { keep: "yes", drop: "no", n: 1 };
const filter = ["keep", "n"];
print(JSON.stringify(obj, filter));
