declare function print(value: unknown): void;

function f(x: number): number;
function f(x: string): string;
function f(x: number | string): number | string {
  return x;
}
print(f(2));
