declare function print(value: unknown): void;

print(Number(null));
print(Number(undefined));
print(Number(true));
print(Number(false));
print(Number(0));
print(Number(NaN));
print(Number(Infinity));
