declare function print(value: unknown): void;

const values: unknown[] = [0];

const withUndefined = values.map(function (this: unknown) {
  return this === undefined;
}, undefined);
print(withUndefined[0]);

const withNull = values.map(function (this: unknown) {
  return this === null;
}, null);
print(withNull[0]);

const withNumber = values.map(function (this: unknown) {
  return this === 4;
}, 4);
print(withNumber[0]);
