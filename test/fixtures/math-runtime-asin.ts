declare function print(value: unknown): void;

print(Math.asin(0));
print(Math.round(Math.asin(1) * 1000));
print(Math.round(Math.asin(-1) * 1000));
print(Number.isNaN(Math.asin(2)));
