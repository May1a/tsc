declare function print(value: unknown): void;

const values: unknown[] = [1, 2];
const holder = {
  visit(value: unknown): unknown {
    return value;
  }
};

const mapped = values.map(holder.visit, holder);
print(mapped.length);
