declare function print(value: unknown): void;

// Logical assignment to properties: the target is read once and stored only when the operator assigns.
const record: { missing: number | undefined; zero: number; one: number } = { missing: undefined, zero: 0, one: 1 };
record.missing ??= 4;
record.zero ||= 7;
record.one &&= 9;
record.one ??= 100;
print(record.missing);
print(record.zero);
print(record.one);

const values: number[] = [0, 2];
const first = 0;
values[first] ||= 5;
values[1] &&= 6;
print(values[0]);
print(values[1]);

class Counter {
  value = 0;
  bump(): void {
    this.value ||= 2;
  }
}
const counter = new Counter();
counter.bump();
print(counter.value);
