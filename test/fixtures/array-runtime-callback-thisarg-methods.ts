declare function print(value: unknown): void;

const values: unknown[] = [1, 2, 3];

const mapped = values.map(function (this: { factor: number }, value) {
  return Number(value) * Number(this.factor);
}, { factor: 2 });
print(mapped[2]);

const filtered = values.filter(function (this: { minimum: number }, value) {
  return Number(value) >= Number(this.minimum);
}, { minimum: 2 });
print(filtered.length);
print(filtered[0]);

const found = values.find(function (this: { target: number }, value) {
  return Number(value) === Number(this.target);
}, { target: 2 });
print(found);

const foundIndex = values.findIndex(function (this: { target: number }, value) {
  return Number(value) === Number(this.target);
}, { target: 3 });
print(foundIndex);

values.forEach(function (this: { offset: number }, value) {
  print(Number(value) + Number(this.offset));
}, { offset: 10 });

const flattened = values.flatMap(function (this: { offset: number }, value) {
  return [value, Number(value) + Number(this.offset)];
}, { offset: 20 });
print(flattened.length);
print(flattened[1]);
print(flattened[5]);
