declare function print(value: unknown): void;

let n = 0;
const get = () => n;
n = 42;
print(get());
n += 1;
print(get());
