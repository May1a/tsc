declare function print(value: unknown): void;

const rows = [{ left: "", right: "fallback" }, { left: "value", right: "other" }];
for (const row of rows) {
  if (row.left !== undefined && row.right !== undefined) { print("both present"); }
  if (row.left === "value" || row.right === "fallback") { print("match"); }
  const either = row.left || row.right;
  const both = row.left && row.right;
  const selected = row.left === "value" ? row.left : row.right;
  print(either);
  print(both);
  print(selected);
  if ((row.left !== undefined && row.right !== undefined) || row.left === "") { print("nested"); }
}
