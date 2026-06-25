declare function print(value: unknown): void;

print(`${@cpp`return tscn::number(42);`}`);
