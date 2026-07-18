/*---
description: Unsupported class forms are coverage gaps rather than harness failures
flags: [generated]
features: [class-static-block]
---*/
class Example {
  static {
    (() => { class await {} });
  }
}
