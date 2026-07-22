declare function print(value: unknown): void;

const obj: { [key: string]: unknown } = { a: "1" };
obj.self = obj;
try {
  JSON.stringify(obj);
} catch (e) {
  print(e instanceof TypeError ? e.name : "wrong");
  print(e instanceof TypeError && e.message.length > 0);
}
