declare function print(value: unknown): void;

const a: unknown = undefined;
print((a as any)?.b.c.d);

const root: unknown = { child: { leaf: "deep" } };
print((root as any)?.child.leaf);

const maybe: unknown = undefined;
print((maybe as any)?.b?.c);
