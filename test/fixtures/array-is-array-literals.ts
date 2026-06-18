declare function print(value: unknown): void;

print(Array.isArray(undefined));
print(Array.isArray(null));
print(Array.isArray(true));
print(Array.isArray({ value: 1 }));
