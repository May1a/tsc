declare function print(value: unknown): void;

var count = 1;
count = count + 1;
print(count);

var greeting = "hello";
print(greeting);

var ready = true;
print(ready);

for (var i = 0; i < 3; i = i + 1) {
  print(i);
}
