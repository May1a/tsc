declare function print(value: unknown): void;

function side() {
  print("rhs");
  return 1;
}
class C {
  set #x(value: any) {
    print("setter");
    print(value);
  }
  put(receiver: any) {
    receiver.#x = side();
  }
}
const c = new C();
try {
  c.put({});
} catch (error: any) {
  print(error.name);
}
c.put(c);
