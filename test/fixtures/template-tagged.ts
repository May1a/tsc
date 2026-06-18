declare function print(value: unknown): void;

function tag(strings: any, ...values: any[]): string {
  return strings[0] + "|" + values[0];
}

const n = 7;
print(tag`text ${n} more`);
