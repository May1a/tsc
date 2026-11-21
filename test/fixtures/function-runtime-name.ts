declare function print(value: unknown): void;

function greet(): string { return "hi"; }
const alias = greet;
print(greet.name);
print(alias.name);
