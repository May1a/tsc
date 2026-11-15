declare function print(value: unknown): void;

let n = 0;
const inc = () => ++n;
inc();
inc();
print(n);
