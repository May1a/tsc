declare function print(value: unknown): void;

const d = new Date(0);
print(typeof d.toString());
print(d.toString().length > 0);
print(new Date(NaN).toString());
