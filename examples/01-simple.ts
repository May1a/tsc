
declare function print(x: unknown): void;

function test() {
    let i = 0;
    while (i < 100) {
        print(i);
        i++;
    }
}

test();
