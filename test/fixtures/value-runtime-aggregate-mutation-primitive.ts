declare function print(value: unknown): void;

const value: any = 1;
value.x = "bad";
print(value);
