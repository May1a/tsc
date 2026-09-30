declare function print(value: unknown): void;

const s: string = "aXbXc";
print(s.matchAll(/X/g));