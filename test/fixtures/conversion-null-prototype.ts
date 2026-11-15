declare function print(value: unknown): void;
const o: any = Object.create(null); try { print(String(o)); } catch(e:any) { print(e.name); }
