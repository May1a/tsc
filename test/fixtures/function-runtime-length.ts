declare function print(value: unknown): void;

function zero(): number { return 0; }
function two(a: number, b: number): number { return a + b; }
function withDefault(a: number, b: number = 1, c: number = 2): number { return a + b + c; }
const arrow = (x: number, y: number, z: number): number => x + y + z;

print(zero.length);
print(two.length);
print(withDefault.length);
print(arrow.length);
