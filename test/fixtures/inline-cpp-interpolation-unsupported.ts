declare function print(value: unknown): void;

const value = 42;
print(@cpp`return tscn::number(${value});`);
