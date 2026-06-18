declare function print(value: unknown): void;
const zero: any = 0;
const value: any = "value";
const truthy: any = true;
print(zero || "fallback");
print(value || "fallback");
print(zero && "right");
print(truthy && "right");
