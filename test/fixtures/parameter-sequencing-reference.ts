declare function print(value: unknown): void;
function f({ x }: { x: number }, y = x) { print(y); }
f({ x: 7 });
