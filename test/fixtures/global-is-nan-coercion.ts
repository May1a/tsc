declare function print(value: unknown): void;
print(isNaN("x" as any));
print(isNaN("1" as any));
print(isNaN(undefined as any));
print(isNaN(null as any));
