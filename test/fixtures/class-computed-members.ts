declare function print(value: unknown): void;

function track(key: string): string {
  print(key);
  return key;
}

const staticKey = "greet";

class C {
  [track("first")]() {
    return 1;
  }
  [staticKey]() {
    return 2;
  }
  [track("third")]() {
    return 3;
  }
}

print("defined");
const instance = new C();
print(instance.greet());
print("constructed");
