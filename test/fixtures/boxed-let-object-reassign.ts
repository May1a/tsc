declare function print(value: unknown): void;

let o = { x: 1 };
o = { x: 2 };
print(o.x);
