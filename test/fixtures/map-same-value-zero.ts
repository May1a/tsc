declare function print(value: unknown): void;

const map = new Map();
map.set(NaN, "nan");
print(map.get(Number("nope")));
map.set(0, "zero");
print(map.get(-0));
map.set(-0, "negzero");
print(map.size);
print(map.get(0));
