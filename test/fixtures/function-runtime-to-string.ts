declare function print(value: unknown): void;

function sample(): number { return 1; }
const raw = sample.toString();
print(typeof raw);
const text = String(raw);
print(text.includes("function"));
print(text.includes("sample"));
