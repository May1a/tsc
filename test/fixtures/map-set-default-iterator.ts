declare function print(value: unknown): void;

const map = new Map<unknown, unknown>();
map.set("key", 42);
const mapIterator = map[Symbol.iterator]();
const mapFirst = mapIterator.next();
const mapEntry: any = mapFirst.value;
print(mapEntry[0]);
print(mapEntry[1]);
print(mapFirst.done);

const set = new Set<unknown>();
set.add("value");
const setIterator = set[Symbol.iterator]();
const setFirst = setIterator.next();
print(setFirst.value);
print(setFirst.done);
