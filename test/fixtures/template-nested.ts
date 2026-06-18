declare function print(value: unknown): void;
const x = 5;
print(`Outer ${`inner ${x}`}`);
