declare function print(value: unknown): void;

// Names a `for (let [...] = ...)` header destructures get a fresh binding per iteration.
const fs: any[] = [];
for (let [i, limit]: any[] = [0, 3]; i < limit; i++) {
  fs.push(() => i);
}
for (const f of fs) print(f());
