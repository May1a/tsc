declare function print(value: unknown): void;

const f = async (): Promise<number> => 1;
print(f());
