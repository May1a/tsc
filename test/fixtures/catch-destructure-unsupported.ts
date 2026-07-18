// @ts-nocheck
try {
  throw [];
} catch ([...[value = 1]]) {
  void value;
}
