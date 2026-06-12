declare function print(value: unknown): void;

const empty: unknown[] = [];
const nonEmpty: unknown[] = ["a", "b", "c"];

const e1: boolean = (empty as any).every();
const e2: boolean = (empty as any).some();
const e3: boolean = (nonEmpty as any).every();
const e4: boolean = (nonEmpty as any).some();
print(e1);
print(e2);
print(e3);
print(e4);
