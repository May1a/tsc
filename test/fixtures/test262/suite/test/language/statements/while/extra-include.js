/*---
description: The compiler-owned propertyHelper include verifies descriptor attributes and behavior
flags: [generated]
includes: [propertyHelper.js]
---*/
const target = {};
Object.defineProperty(target, "visible", { value: 1, writable: true, enumerable: true, configurable: false });
verifyProperty(target, "visible", { value: 1, writable: true, enumerable: true, configurable: false });
verifyEqualTo(target, "visible", 1);
verifyWritable(target, "visible");
verifyEnumerable(target, "visible");
verifyNotConfigurable(target, "visible");

Object.defineProperty(target, "hidden", { value: 2, writable: false, enumerable: false, configurable: false });
verifyNotWritable(target, "hidden");
verifyNotEnumerable(target, "hidden");

Object.defineProperty(target, "removable", { value: 3, writable: true, enumerable: false, configurable: true });
verifyConfigurable(target, "removable");
verifyProperty(target, "removable", undefined);
