declare function print(value: unknown): void;

const e = new Error("boom");
print(e.message);
print(e.name);

const f = Error("call form");
print(f.message);
print(f.name);

const empty = new Error();
print(empty.message);
print(empty.name);
