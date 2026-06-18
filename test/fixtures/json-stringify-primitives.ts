declare function print(value: unknown): void;

print(JSON.stringify("a"));
print(JSON.stringify(1));
print(JSON.stringify(true));
print(JSON.stringify(null));
print(JSON.stringify(0 / 0));
print(JSON.stringify(1 / 0));
print(JSON.stringify(undefined));
