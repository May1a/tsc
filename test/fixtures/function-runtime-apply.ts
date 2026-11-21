declare function print(value: unknown): void;

function sum(this: { offset: number }, a: number, b: number, c: number): number {
  return this.offset + a + b + c;
}

const args: [number, number, number] = [1, 2, 3];
print(sum.apply({ offset: 10 }, args));
function constant(this: { label: string }): string {
  return this.label;
}
print(constant.apply({ label: "ok" }, undefined as unknown as []));
