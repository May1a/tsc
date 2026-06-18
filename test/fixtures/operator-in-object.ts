declare function print(value: unknown): void;

const o: { a: string; b: string; c?: string } = { a: "x", b: "y" };
print("a" in o);
print("c" in o);
print("z" in o);
const a: any[] = [1, 2];
print(0 in a);
print(2 in a);
