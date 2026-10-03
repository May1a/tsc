declare function print(value: unknown): void;

print(Number.isSafeInteger(7));
print(Number.isSafeInteger(1.5));