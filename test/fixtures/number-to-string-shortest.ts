declare function print(value: unknown): void;

print(1234567);
print(12586269025);
print(0.1 + 0.2);
print(1e21);
print(1e-7);
print(1.5e-7);
print(123e-20);
print(-0);
print(2 ** 53);
print(5e-324);
print(Number.MAX_VALUE);
print(-1.5);
print(100);
print(NaN);
print(Infinity);
print(-Infinity);

print(String(1234567));
print(String(0.1 + 0.2));
print(String(1e21));
print(String(5e-324));
print(String(-0));

print(`${1234567}`);
print(`${0.1 + 0.2}`);
print(`${1e21}`);
print(`${5e-324}`);

print(JSON.stringify([1234567, 1e21, 5e-324, -1.5, NaN, Infinity, -Infinity]));