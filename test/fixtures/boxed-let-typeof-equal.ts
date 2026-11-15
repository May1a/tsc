declare function print(value: unknown): void;

let v: number | string = 1;
v = "s";
print(v === "s");
print(v);
