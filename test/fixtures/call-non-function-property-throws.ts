declare function print(value: unknown): void;

const holder: { count: number; label: string } = { count: 1, label: "x" };

// A property that is present but not callable is a TypeError, not a null dereference.
(holder as unknown as { count(): void }).count();
print("unreachable");
