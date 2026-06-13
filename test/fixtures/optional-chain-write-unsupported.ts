declare function print(value: unknown): void;

const obj = { name: "x" };
((obj as any)?.name) = "y";
print(obj.name);
