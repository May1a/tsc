declare function print(value: unknown): void;

const r = new RangeError("out of range");
print(r.message);
print(r.name);

const ev = new EvalError("bad eval");
print(ev.name);

const u = new URIError("bad uri");
print(u.name);
