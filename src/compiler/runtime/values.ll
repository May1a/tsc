define i1 @valueStrictEquals(i64 %left, i64 %right) {
entry:
  %left.number = call i1 @valueIsNumberForSameValueZero(i64 %left)
  %right.number = call i1 @valueIsNumberForSameValueZero(i64 %right)
  %both.number = and i1 %left.number, %right.number
  br i1 %both.number, label %number.compare, label %check.same
number.compare:
  %left.d = call double @valueNumber(i64 %left)
  %right.d = call double @valueNumber(i64 %right)
  %numeric.equal = fcmp oeq double %left.d, %right.d
  br i1 %numeric.equal, label %equal, label %not.equal
check.same:
  %same = icmp eq i64 %left, %right
  br i1 %same, label %equal, label %check.strings
check.strings:
  %left.tag = and i64 %left, -281474976710656
  %right.tag = and i64 %right, -281474976710656
  %left.string = icmp eq i64 %left.tag, 9221683186994511872
  %right.string = icmp eq i64 %right.tag, 9221683186994511872
  %both.strings = and i1 %left.string, %right.string
  br i1 %both.strings, label %string.compare, label %not.equal
string.compare:
  %left.len = call i64 @valueStringLength(i64 %left)
  %right.len = call i64 @valueStringLength(i64 %right)
  %same.len = icmp eq i64 %left.len, %right.len
  br i1 %same.len, label %string.bytes, label %not.equal
string.bytes:
  %left.ptr = call ptr @valueStringPtr(i64 %left)
  %right.ptr = call ptr @valueStringPtr(i64 %right)
  %cmp = call i32 @memcmp(ptr %left.ptr, ptr %right.ptr, i64 %left.len)
  %same.bytes = icmp eq i32 %cmp, 0
  br i1 %same.bytes, label %equal, label %not.equal
equal:
  ret i1 true
not.equal:
  ret i1 false
}
define i1 @valueIsNumberForSameValueZero(i64 %value) {
entry:
  %is.undefined = icmp eq i64 %value, 9222246136947933184
  br i1 %is.undefined, label %false, label %check.false
check.false:
  %is.false = icmp eq i64 %value, 9222246136947933185
  br i1 %is.false, label %false, label %check.true
check.true:
  %is.true = icmp eq i64 %value, 9222246136947933186
  br i1 %is.true, label %false, label %check.null
check.null:
  %is.null = icmp eq i64 %value, 9222246136947933187
  br i1 %is.null, label %false, label %check.hole
check.hole:
  %is.hole = icmp eq i64 %value, 9222246136947933191
  br i1 %is.hole, label %false, label %check.tag
check.tag:
  %tag = and i64 %value, -281474976710656
  %is.object = icmp eq i64 %tag, 9221120237041090560
  %is.array = icmp eq i64 %tag, 9221401712017801216
  %is.string = icmp eq i64 %tag, 9221683186994511872
  %is.function = icmp eq i64 %tag, 9221964661971222528
  %is.object.or.array = or i1 %is.object, %is.array
  %is.aggregate.or.string = or i1 %is.object.or.array, %is.string
  %is.boxed = or i1 %is.aggregate.or.string, %is.function
  br i1 %is.boxed, label %false, label %true
true:
  ret i1 true
false:
  ret i1 false
}
define i1 @valueSameValueZero(i64 %left, i64 %right) {
entry:
  %strict = call i1 @valueStrictEquals(i64 %left, i64 %right)
  br i1 %strict, label %true, label %number.guard
number.guard:
  %left.number = call i1 @valueIsNumberForSameValueZero(i64 %left)
  %right.number = call i1 @valueIsNumberForSameValueZero(i64 %right)
  %both.number = and i1 %left.number, %right.number
  br i1 %both.number, label %number.compare, label %false
number.compare:
  %left.d = call double @valueNumber(i64 %left)
  %right.d = call double @valueNumber(i64 %right)
  %numeric.equal = fcmp oeq double %left.d, %right.d
  br i1 %numeric.equal, label %true, label %nan.compare
nan.compare:
  %left.nan = fcmp uno double %left.d, %left.d
  %right.nan = fcmp uno double %right.d, %right.d
  %both.nan = and i1 %left.nan, %right.nan
  br i1 %both.nan, label %true, label %false
true:
  ret i1 true
false:
  ret i1 false
}
define double @valueToNumber(i64 %value) {
entry:
  %is.undefined = icmp eq i64 %value, 9222246136947933184
  br i1 %is.undefined, label %nan, label %check.null
check.null:
  %is.null = icmp eq i64 %value, 9222246136947933187
  br i1 %is.null, label %zero, label %check.false
check.false:
  %is.false = icmp eq i64 %value, 9222246136947933185
  br i1 %is.false, label %zero, label %check.true
check.true:
  %is.true = icmp eq i64 %value, 9222246136947933186
  br i1 %is.true, label %one, label %check.string
check.string:
  %tag = and i64 %value, -281474976710656
  %is.string = icmp eq i64 %tag, 9221683186994511872
  br i1 %is.string, label %string, label %check.aggregate
check.aggregate:
  %is.object = icmp eq i64 %tag, 9221120237041090560
  %is.array = icmp eq i64 %tag, 9221401712017801216
  %is.aggregate = or i1 %is.object, %is.array
  br i1 %is.aggregate, label %nan, label %as.number
string:
  %ptr = call ptr @valueStringPtr(i64 %value)
  br label %string.skip.ws
string.skip.ws:
  %scan.i = phi i64 [ 0, %string ], [ %scan.next, %scan_ws ]
  %scan.ptr = getelementptr i8, ptr %ptr, i64 %scan.i
  %scan.byte = load i8, ptr %scan.ptr
  %scan.is.space = icmp eq i8 %scan.byte, 32
  %scan.is.tab = icmp eq i8 %scan.byte, 9
  %scan.is.lf = icmp eq i8 %scan.byte, 10
  %scan.is.ws.0 = or i1 %scan.is.space, %scan.is.tab
  %scan.is.ws = or i1 %scan.is.ws.0, %scan.is.lf
  br i1 %scan.is.ws, label %scan_ws, label %string.validate
scan_ws:
  %scan.next = add i64 %scan.i, 1
  br label %string.skip.ws
string.validate:
  %is.digit.low = icmp uge i8 %scan.byte, 48
  %is.digit.high = icmp ule i8 %scan.byte, 57
  %is.digit = and i1 %is.digit.low, %is.digit.high
  %is.plus = icmp eq i8 %scan.byte, 43
  %is.minus = icmp eq i8 %scan.byte, 45
  %is.dot = icmp eq i8 %scan.byte, 46
  %sign = or i1 %is.plus, %is.minus
  %numeric.start.0 = or i1 %is.digit, %sign
  %numeric.start = or i1 %numeric.start.0, %is.dot
  br i1 %numeric.start, label %string.parse, label %nan
string.parse:
  %parsed = call double @strtod(ptr %ptr, ptr null)
  ret double %parsed
as.number:
  %number = call double @valueNumber(i64 %value)
  ret double %number
zero:
  ret double 0.0
one:
  ret double 1.0
nan:
  ret double 0x7FF5000000000000
}
define i1 @valueLooseEquals(i64 %left, i64 %right) {
entry:
  %strict = call i1 @valueStrictEquals(i64 %left, i64 %right)
  br i1 %strict, label %true, label %nullish
nullish:
  %left.null = icmp eq i64 %left, 9222246136947933187
  %left.undefined = icmp eq i64 %left, 9222246136947933184
  %right.null = icmp eq i64 %right, 9222246136947933187
  %right.undefined = icmp eq i64 %right, 9222246136947933184
  %left.nullish = or i1 %left.null, %left.undefined
  %right.nullish = or i1 %right.null, %right.undefined
  %both.nullish = and i1 %left.nullish, %right.nullish
  br i1 %both.nullish, label %true, label %one.nullish
one.nullish:
  %either.nullish = or i1 %left.nullish, %right.nullish
  br i1 %either.nullish, label %false, label %numeric
numeric:
  %left.num = call double @valueToNumber(i64 %left)
  %right.num = call double @valueToNumber(i64 %right)
  %same = fcmp oeq double %left.num, %right.num
  ret i1 %same
true:
  ret i1 true
false:
  ret i1 false
}
define i1 @valueRelationalCompare(i64 %left, i64 %right, i64 %operator) {
entry:
  %left.tag = and i64 %left, -281474976710656
  %right.tag = and i64 %right, -281474976710656
  %left.string = icmp eq i64 %left.tag, 9221683186994511872
  %right.string = icmp eq i64 %right.tag, 9221683186994511872
  %both.strings = and i1 %left.string, %right.string
  br i1 %both.strings, label %strings, label %numbers
strings:
  %left.ptr = call ptr @valueStringPtr(i64 %left)
  %right.ptr = call ptr @valueStringPtr(i64 %right)
  %left.len = call i64 @valueStringLength(i64 %left)
  %right.len = call i64 @valueStringLength(i64 %right)
  %min.cmp = icmp ult i64 %left.len, %right.len
  %min = select i1 %min.cmp, i64 %left.len, i64 %right.len
  %byte.cmp = call i32 @memcmp(ptr %left.ptr, ptr %right.ptr, i64 %min)
  %byte.lt = icmp slt i32 %byte.cmp, 0
  %byte.gt = icmp sgt i32 %byte.cmp, 0
  %len.lt = icmp ult i64 %left.len, %right.len
  %len.gt = icmp ugt i64 %left.len, %right.len
  %lt.when.prefix = and i1 %len.lt, true
  %gt.when.prefix = and i1 %len.gt, true
  %bytes.equal = icmp eq i32 %byte.cmp, 0
  %prefix.lt = and i1 %bytes.equal, %lt.when.prefix
  %prefix.gt = and i1 %bytes.equal, %gt.when.prefix
  %str.lt = or i1 %byte.lt, %prefix.lt
  %str.gt = or i1 %byte.gt, %prefix.gt
  br label %select
numbers:
  %left.num = call double @valueToNumber(i64 %left)
  %right.num = call double @valueToNumber(i64 %right)
  %num.lt = fcmp olt double %left.num, %right.num
  %num.gt = fcmp ogt double %left.num, %right.num
  br label %select
select:
  %lt = phi i1 [ %str.lt, %strings ], [ %num.lt, %numbers ]
  %gt = phi i1 [ %str.gt, %strings ], [ %num.gt, %numbers ]
  %not.lt = xor i1 %lt, true
  %not.gt = xor i1 %gt, true
  %eq = and i1 %not.lt, %not.gt
  %op.lt = icmp eq i64 %operator, 0
  %op.le = icmp eq i64 %operator, 1
  %op.gt = icmp eq i64 %operator, 2
  %op.ge = icmp eq i64 %operator, 3
  %le = or i1 %lt, %eq
  %ge = or i1 %gt, %eq
  %r0 = select i1 %op.lt, i1 %lt, i1 false
  %r1 = select i1 %op.le, i1 %le, i1 %r0
  %r2 = select i1 %op.gt, i1 %gt, i1 %r1
  %r3 = select i1 %op.ge, i1 %ge, i1 %r2
  ret i1 %r3
}
define i64 @valuePlus(i64 %left, i64 %right) {
entry:
  %left.tag = and i64 %left, -281474976710656
  %right.tag = and i64 %right, -281474976710656
  %left.string = icmp eq i64 %left.tag, 9221683186994511872
  %right.string = icmp eq i64 %right.tag, 9221683186994511872
  %left.object = icmp eq i64 %left.tag, 9221120237041090560
  %right.object = icmp eq i64 %right.tag, 9221120237041090560
  %left.array = icmp eq i64 %left.tag, 9221401712017801216
  %right.array = icmp eq i64 %right.tag, 9221401712017801216
  %left.aggregate = or i1 %left.object, %left.array
  %right.aggregate = or i1 %right.object, %right.array
  %has.string.0 = or i1 %left.string, %right.string
  %has.aggregate = or i1 %left.aggregate, %right.aggregate
  %concat = or i1 %has.string.0, %has.aggregate
  br i1 %concat, label %strings, label %numbers
strings:
  %left.str = call { ptr, i64 } @valueToString(i64 %left)
  %left.ptr = extractvalue { ptr, i64 } %left.str, 0
  %left.len = extractvalue { ptr, i64 } %left.str, 1
  %right.str = call { ptr, i64 } @valueToString(i64 %right)
  %right.ptr = extractvalue { ptr, i64 } %right.str, 0
  %right.len = extractvalue { ptr, i64 } %right.str, 1
  %concat.ptr = call ptr @strConcat(i64 %left.len, ptr %left.ptr, i64 %right.len, ptr %right.ptr)
  %total = add i64 %left.len, %right.len
  %boxed = call i64 @valueBoxString(ptr %concat.ptr, i64 %total)
  ret i64 %boxed
numbers:
  %left.num = call double @valueToNumber(i64 %left)
  %right.num = call double @valueToNumber(i64 %right)
  %sum = fadd double %left.num, %right.num
  %sum.is.nan = fcmp uno double %sum, %sum
  %safe.sum = select i1 %sum.is.nan, double 0x7FF5000000000000, double %sum
  %boxed.num = call i64 @valueBoxNumber(double %safe.sum)
  ret i64 %boxed.num
}
define i64 @valueBoxString(ptr %string.ptr, i64 %string.len) {
entry:
  %cell = call ptr @gcAlloc(i64 1, i64 16)
  %payload = getelementptr i8, ptr %cell, i64 8
  store ptr %string.ptr, ptr %payload
  %len.slot = getelementptr i8, ptr %payload, i64 8
  store i64 %string.len, ptr %len.slot
  %box.bits = ptrtoint ptr %cell to i64
  %payload.bits = and i64 %box.bits, 281474976710655
  %value = or i64 %payload.bits, 9221683186994511872
  ret i64 %value
}
define ptr @valueStringPtr(i64 %value) {
entry:
  %box.bits = and i64 %value, 281474976710655
  %box = inttoptr i64 %box.bits to ptr
  %payload = getelementptr i8, ptr %box, i64 8
  %ptr = load ptr, ptr %payload
  ret ptr %ptr
}
define i64 @valueStringLength(i64 %value) {
entry:
  %box.bits = and i64 %value, 281474976710655
  %box = inttoptr i64 %box.bits to ptr
  %payload = getelementptr i8, ptr %box, i64 8
  %len.slot = getelementptr i8, ptr %payload, i64 8
  %len = load i64, ptr %len.slot
  ret i64 %len
}
define i64 @valueBoxArray(ptr %array) {
entry:
  %bits = ptrtoint ptr %array to i64
  %payload = and i64 %bits, 281474976710655
  %value = or i64 %payload, 9221401712017801216
  ret i64 %value
}
define ptr @valueObjectPtr(i64 %value) {
entry:
  %bits = and i64 %value, 281474976710655
  %ptr = inttoptr i64 %bits to ptr
  ret ptr %ptr
}
define i1 @valueIsObject(i64 %value) {
entry:
  %tag = and i64 %value, -281474976710656
  %is.object = icmp eq i64 %tag, 9221120237041090560
  ret i1 %is.object
}
define i1 @valueIsArray(i64 %value) {
entry:
  %tag = and i64 %value, -281474976710656
  %is.array = icmp eq i64 %tag, 9221401712017801216
  ret i1 %is.array
}
define i1 @valueIsFunction(i64 %value) {
entry:
  %tag = and i64 %value, -281474976710656
  %is.function = icmp eq i64 %tag, 9221964661971222528
  ret i1 %is.function
}
define i1 @valueIsString(i64 %value) {
entry:
  %tag = and i64 %value, -281474976710656
  %is.string = icmp eq i64 %tag, 9221683186994511872
  ret i1 %is.string
}
define i64 @valuePropertyGet(i64 %value, i64 %key.len, ptr %key.ptr) {
entry:
  %is.function = call i1 @valueIsFunction(i64 %value)
  br i1 %is.function, label %function, label %check.object
function:
  %function.result = call i64 @functionObjectGet(i64 %value, i64 %key.len, ptr %key.ptr)
  ret i64 %function.result
check.object:
  %is.object = call i1 @valueIsObject(i64 %value)
  br i1 %is.object, label %object, label %check.array
object:
  %object.ptr = call ptr @valueObjectPtr(i64 %value)
  %object.result = call i64 @objectGet(ptr %object.ptr, i64 %key.len, ptr %key.ptr)
  ret i64 %object.result
check.array:
  %is.array = call i1 @valueIsArray(i64 %value)
  br i1 %is.array, label %array, label %check.string
array:
  %array.ptr = call ptr @valueArrayPtr(i64 %value)
  %array.result = call i64 @arrayGetWithKey(ptr %array.ptr, i64 -1, i64 %key.len, ptr %key.ptr)
  %array.missing = icmp eq i64 %array.result, 9222246136947933184
  br i1 %array.missing, label %array.builtin, label %array.hit
array.hit:
  ret i64 %array.result
array.builtin:
  %array.is.iter = icmp eq i64 %key.len, 18
  br i1 %array.is.iter, label %array.iter.cmp, label %missing
array.iter.cmp:
  %array.key.cmp = call i32 @memcmp(ptr %key.ptr, ptr @.symbol.iterator.key, i64 18)
  %array.key.same = icmp eq i32 %array.key.cmp, 0
  br i1 %array.key.same, label %array.iter, label %missing
array.iter:
  %array.method = call i64 @functionObjectNew(ptr @arrayIteratorMethod, ptr null, i64 9222246136947933184, i64 9222246136947933184, i64 0)
  ret i64 %array.method
check.string:
  %is.string = call i1 @valueIsString(i64 %value)
  br i1 %is.string, label %string.builtin, label %missing
string.builtin:
  %string.is.iter = icmp eq i64 %key.len, 18
  br i1 %string.is.iter, label %string.iter.cmp, label %missing
string.iter.cmp:
  %string.key.cmp = call i32 @memcmp(ptr %key.ptr, ptr @.symbol.iterator.key, i64 18)
  %string.key.same = icmp eq i32 %string.key.cmp, 0
  br i1 %string.key.same, label %string.iter, label %missing
string.iter:
  %string.method = call i64 @functionObjectNew(ptr @stringIteratorMethod, ptr null, i64 9222246136947933184, i64 9222246136947933184, i64 0)
  ret i64 %string.method
missing:
  ret i64 9222246136947933184
}
@.valuelength.key = private unnamed_addr constant [7 x i8] c"length\00"

define i64 @valueLength(i64 %value) {
entry:
  %tagged = and i64 %value, -281474976710656
  %is.string = icmp eq i64 %tagged, 9221683186994511872
  br i1 %is.string, label %string, label %check.array
string:
  %string.len = call i64 @valueStringLength(i64 %value)
  ret i64 %string.len
check.array:
  %is.array = icmp eq i64 %tagged, 9221401712017801216
  br i1 %is.array, label %array, label %check.object
array:
  %array.ptr = call ptr @valueArrayPtr(i64 %value)
  %array.len = call i64 @arrayLength(ptr %array.ptr)
  ret i64 %array.len
check.object:
  %is.object = icmp eq i64 %tagged, 9221120237041090560
  br i1 %is.object, label %object, label %zero
object:
  %object.ptr = call ptr @valueObjectPtr(i64 %value)
  %raw = call i64 @objectGet(ptr %object.ptr, i64 6, ptr @.valuelength.key)
  %raw.tagged = and i64 %raw, -281474976710656
  %raw.object = icmp eq i64 %raw.tagged, 9221120237041090560
  %raw.array = icmp eq i64 %raw.tagged, 9221401712017801216
  %raw.string = icmp eq i64 %raw.tagged, 9221683186994511872
  %raw.function = icmp eq i64 %raw.tagged, 9221964661971222528
  %raw.ref.0 = or i1 %raw.object, %raw.array
  %raw.ref.1 = or i1 %raw.string, %raw.function
  %raw.ref = or i1 %raw.ref.0, %raw.ref.1
  %raw.undefined = icmp eq i64 %raw, 9222246136947933184
  %raw.null = icmp eq i64 %raw, 9222246136947933187
  %raw.true = icmp eq i64 %raw, 9222246136947933186
  %raw.false = icmp eq i64 %raw, 9222246136947933185
  %raw.immediate.0 = or i1 %raw.undefined, %raw.null
  %raw.immediate.1 = or i1 %raw.true, %raw.false
  %raw.immediate = or i1 %raw.immediate.0, %raw.immediate.1
  %raw.not.number = or i1 %raw.ref, %raw.immediate
  br i1 %raw.not.number, label %zero, label %object.number
object.number:
  %raw.number = call double @valueNumber(i64 %raw)
  %object.len = fptosi double %raw.number to i64
  ret i64 %object.len
zero:
  ret i64 0
}
define i1 @valueTruthy(i64 %value) {
entry:
  %is.undefined = icmp eq i64 %value, 9222246136947933184
  br i1 %is.undefined, label %false, label %check.null
check.null:
  %is.null = icmp eq i64 %value, 9222246136947933187
  br i1 %is.null, label %false, label %check.false
check.false:
  %is.false = icmp eq i64 %value, 9222246136947933185
  br i1 %is.false, label %false, label %check.true
check.true:
  %is.true = icmp eq i64 %value, 9222246136947933186
  br i1 %is.true, label %true, label %check.string
check.string:
  %tagged = and i64 %value, -281474976710656
  %is.string = icmp eq i64 %tagged, 9221683186994511872
  br i1 %is.string, label %string, label %check.aggregate
string:
  %len = call i64 @valueStringLength(i64 %value)
  %nonempty = icmp ne i64 %len, 0
  ret i1 %nonempty
check.aggregate:
  %is.object = icmp eq i64 %tagged, 9221120237041090560
  %is.array = icmp eq i64 %tagged, 9221401712017801216
  %is.aggregate = or i1 %is.object, %is.array
  br i1 %is.aggregate, label %true, label %check.function
check.function:
  %is.function = icmp eq i64 %tagged, 9221964661971222528
  br i1 %is.function, label %true, label %number.block
number.block:
  %number.value = call double @valueNumber(i64 %value)
  %nonzero = fcmp one double %number.value, 0.0
  ret i1 %nonzero
true:
  ret i1 true
false:
  ret i1 false
}
@.value.fmt.number = private unnamed_addr constant [4 x i8] c"%g\0A\00"
@.value.number.nan = private unnamed_addr constant [4 x i8] c"NaN\00"
@.value.number.infinity = private unnamed_addr constant [9 x i8] c"Infinity\00"
@.value.number.negative-infinity = private unnamed_addr constant [10 x i8] c"-Infinity\00"
@.value.true = private unnamed_addr constant [5 x i8] c"true\00"
@.value.false = private unnamed_addr constant [6 x i8] c"false\00"
@.value.undefined = private unnamed_addr constant [10 x i8] c"undefined\00"
@.value.null = private unnamed_addr constant [5 x i8] c"null\00"
@.value.object = private unnamed_addr constant [16 x i8] c"[object Object]\00"
@.value.array = private unnamed_addr constant [15 x i8] c"[object Array]\00"

define void @valuePrint(i64 %value) {
entry:
  %is.undefined = icmp eq i64 %value, 9222246136947933184
  br i1 %is.undefined, label %print.undefined, label %check.false
check.false:
  %is.false = icmp eq i64 %value, 9222246136947933185
  br i1 %is.false, label %print.false, label %check.true
check.true:
  %is.true = icmp eq i64 %value, 9222246136947933186
  br i1 %is.true, label %print.true, label %check.null
check.null:
  %is.null = icmp eq i64 %value, 9222246136947933187
  br i1 %is.null, label %print.null, label %check.object
check.object:
  %tagged.object = and i64 %value, -281474976710656
  %is.object = icmp eq i64 %tagged.object, 9221120237041090560
  br i1 %is.object, label %check.error, label %check.array
check.error:
  %object.ptr = call ptr @valueObjectPtr(i64 %value)
  %object.class.slot = getelementptr i8, ptr %object.ptr, i64 48
  %object.class = load i64, ptr %object.class.slot
  %is.error = icmp ne i64 %object.class, 0
  br i1 %is.error, label %print.error, label %print.object
check.array:
  %tagged.array = and i64 %value, -281474976710656
  %is.array = icmp eq i64 %tagged.array, 9221401712017801216
  br i1 %is.array, label %print.array, label %check.string
check.string:
  %tagged = and i64 %value, -281474976710656
  %is.string = icmp eq i64 %tagged, 9221683186994511872
  br i1 %is.string, label %print.string, label %print.number
print.undefined:
  call i32 @puts(ptr @.value.undefined)
  ret void
print.false:
  call i32 @puts(ptr @.value.false)
  ret void
print.true:
  call i32 @puts(ptr @.value.true)
  ret void
print.null:
  call i32 @puts(ptr @.value.null)
  ret void
print.object:
  call i32 @puts(ptr @.value.object)
  ret void
print.error:
  %error.string = call { ptr, i64 } @errorToString(ptr %object.ptr)
  %error.ptr = extractvalue { ptr, i64 } %error.string, 0
  call i32 @puts(ptr %error.ptr)
  ret void
print.array:
  call i32 @puts(ptr @.value.array)
  ret void
print.string:
  %ptr = call ptr @valueStringPtr(i64 %value)
  call i32 @puts(ptr %ptr)
  ret void
print.number:
  %number = call double @valueNumber(i64 %value)
  %number.is.nan = fcmp uno double %number, %number
  br i1 %number.is.nan, label %print.number.nan, label %check.number.infinity
check.number.infinity:
  %number.absolute-bits = and i64 %value, 9223372036854775807
  %number.is.infinity = icmp eq i64 %number.absolute-bits, 9218868437227405312
  br i1 %number.is.infinity, label %print.number.infinity, label %print.number.finite
print.number.nan:
  call i32 @puts(ptr @.value.number.nan)
  ret void
print.number.infinity:
  %number.is.negative = icmp slt i64 %value, 0
  br i1 %number.is.negative, label %print.number.negative-infinity, label %print.number.positive-infinity
print.number.negative-infinity:
  call i32 @puts(ptr @.value.number.negative-infinity)
  ret void
print.number.positive-infinity:
  call i32 @puts(ptr @.value.number.infinity)
  ret void
print.number.finite:
  call i32 (ptr, ...) @printf(ptr @.value.fmt.number, double %number)
  ret void
}
@.tostring.fmt.number = private unnamed_addr constant [3 x i8] c"%g\00"
@.tostring.true = private unnamed_addr constant [5 x i8] c"true\00"
@.tostring.false = private unnamed_addr constant [6 x i8] c"false\00"
@.tostring.undefined = private unnamed_addr constant [10 x i8] c"undefined\00"
@.tostring.null = private unnamed_addr constant [5 x i8] c"null\00"
@.tostring.object = private unnamed_addr constant [16 x i8] c"[object Object]\00"
@.tostring.array = private unnamed_addr constant [15 x i8] c"[object Array]\00"
@.tostring.comma = private unnamed_addr constant [2 x i8] c",\00"

define { ptr, i64 } @valueToString(i64 %value) {
entry:
  %is.undefined = icmp eq i64 %value, 9222246136947933184
  br i1 %is.undefined, label %undefined, label %check.false
check.false:
  %is.false = icmp eq i64 %value, 9222246136947933185
  br i1 %is.false, label %false, label %check.true
check.true:
  %is.true = icmp eq i64 %value, 9222246136947933186
  br i1 %is.true, label %true, label %check.null
check.null:
  %is.null = icmp eq i64 %value, 9222246136947933187
  br i1 %is.null, label %null, label %check.object
check.object:
  %tagged.object = and i64 %value, -281474976710656
  %is.object = icmp eq i64 %tagged.object, 9221120237041090560
  br i1 %is.object, label %object, label %check.array
check.array:
  %tagged.array = and i64 %value, -281474976710656
  %is.array = icmp eq i64 %tagged.array, 9221401712017801216
  br i1 %is.array, label %array, label %check.string
check.string:
  %tagged.string = and i64 %value, -281474976710656
  %is.string = icmp eq i64 %tagged.string, 9221683186994511872
  br i1 %is.string, label %string, label %number
undefined:
  %undefined.0 = insertvalue { ptr, i64 } undef, ptr @.tostring.undefined, 0
  %undefined.1 = insertvalue { ptr, i64 } %undefined.0, i64 9, 1
  ret { ptr, i64 } %undefined.1
false:
  %false.0 = insertvalue { ptr, i64 } undef, ptr @.tostring.false, 0
  %false.1 = insertvalue { ptr, i64 } %false.0, i64 5, 1
  ret { ptr, i64 } %false.1
true:
  %true.0 = insertvalue { ptr, i64 } undef, ptr @.tostring.true, 0
  %true.1 = insertvalue { ptr, i64 } %true.0, i64 4, 1
  ret { ptr, i64 } %true.1
null:
  %null.0 = insertvalue { ptr, i64 } undef, ptr @.tostring.null, 0
  %null.1 = insertvalue { ptr, i64 } %null.0, i64 4, 1
  ret { ptr, i64 } %null.1
object:
  %object.0 = insertvalue { ptr, i64 } undef, ptr @.tostring.object, 0
  %object.1 = insertvalue { ptr, i64 } %object.0, i64 15, 1
  ret { ptr, i64 } %object.1
array:
  %array.ptr = call ptr @valueArrayPtr(i64 %value)
  %joined = call ptr @arrayJoin(ptr %array.ptr, i64 1, ptr @.tostring.comma)
  br label %array.len.scan
array.len.scan:
  %array.len = phi i64 [ 0, %array ], [ %array.len.next, %array.len.more ]
  %array.char = getelementptr i8, ptr %joined, i64 %array.len
  %array.byte = load i8, ptr %array.char
  %array.done = icmp eq i8 %array.byte, 0
  br i1 %array.done, label %array.ret, label %array.len.more
array.len.more:
  %array.len.next = add i64 %array.len, 1
  br label %array.len.scan
array.ret:
  %array.0 = insertvalue { ptr, i64 } undef, ptr %joined, 0
  %array.1 = insertvalue { ptr, i64 } %array.0, i64 %array.len, 1
  ret { ptr, i64 } %array.1
string:
  %string.ptr = call ptr @valueStringPtr(i64 %value)
  %string.len = call i64 @valueStringLength(i64 %value)
  %string.0 = insertvalue { ptr, i64 } undef, ptr %string.ptr, 0
  %string.1 = insertvalue { ptr, i64 } %string.0, i64 %string.len, 1
  ret { ptr, i64 } %string.1
number:
  %number.ptr = call ptr @malloc(i64 32)
  %number.value = call double @valueNumber(i64 %value)
  %written = call i32 (ptr, ptr, ...) @sprintf(ptr %number.ptr, ptr @.tostring.fmt.number, double %number.value)
  %number.len = sext i32 %written to i64
  %number.0 = insertvalue { ptr, i64 } undef, ptr %number.ptr, 0
  %number.1 = insertvalue { ptr, i64 } %number.0, i64 %number.len, 1
  ret { ptr, i64 } %number.1
}
define ptr @indexToString(i64 %index) {
entry:
  br label %count.loop
count.loop:
  %count.value = phi i64 [ %index, %entry ], [ %count.next.value, %count.more ]
  %digits = phi i64 [ 1, %entry ], [ %digits.next, %count.more ]
  %count.more.check = icmp uge i64 %count.value, 10
  br i1 %count.more.check, label %count.more, label %alloc
count.more:
  %count.next.value = udiv i64 %count.value, 10
  %digits.next = add i64 %digits, 1
  br label %count.loop
alloc:
  %alloc.size = add i64 %digits, 1
  %out = call ptr @malloc(i64 %alloc.size)
  %nul = getelementptr i8, ptr %out, i64 %digits
  store i8 0, ptr %nul
  br label %fill.loop
fill.loop:
  %fill.value = phi i64 [ %index, %alloc ], [ %fill.next.value, %fill.body ]
  %pos = phi i64 [ %digits, %alloc ], [ %next.pos, %fill.body ]
  %done = icmp eq i64 %pos, 0
  br i1 %done, label %exit, label %fill.body
fill.body:
  %next.pos = sub i64 %pos, 1
  %quotient = udiv i64 %fill.value, 10
  %q10 = mul i64 %quotient, 10
  %remainder = sub i64 %fill.value, %q10
  %digit = add i64 %remainder, 48
  %byte = trunc i64 %digit to i8
  %slot = getelementptr i8, ptr %out, i64 %next.pos
  store i8 %byte, ptr %slot
  %fill.next.value = udiv i64 %fill.value, 10
  br label %fill.loop
exit:
  ret ptr %out
}
define i1 @jsInstanceOf(i64 %value, ptr %target.prototype) {
entry:
  %is.object = call i1 @valueIsObject(i64 %value)
  br i1 %is.object, label %start, label %missing
start:
  %object = call ptr @valueObjectPtr(i64 %value)
  %first = call ptr @objectGetPrototype(ptr %object)
  br label %lookup
lookup:
  %current = phi ptr [ %first, %start ], [ %next, %advance ]
  %is.null = icmp eq ptr %current, null
  br i1 %is.null, label %missing, label %compare
compare:
  %matches = icmp eq ptr %current, %target.prototype
  br i1 %matches, label %found, label %advance
advance:
  %next = call ptr @objectGetPrototype(ptr %current)
  br label %lookup
found:
  ret i1 true
missing:
  ret i1 false
}
define i64 @boxedValueOf(ptr %object) {
entry:
  %count = load i64, ptr %object
  %is.empty = icmp eq i64 %count, 0
  br i1 %is.empty, label %miss, label %load
load:
  %entries.slot = getelementptr i8, ptr %object, i64 16
  %entries = load ptr, ptr %entries.slot
  %value.slot = getelementptr i8, ptr %entries, i64 16
  %value = load i64, ptr %value.slot
  ret i64 %value
miss:
  ret i64 9222246136947933184
}
define { ptr, i64 } @boxedToString(ptr %object) {
entry:
  %count = load i64, ptr %object
  %is.empty = icmp eq i64 %count, 0
  br i1 %is.empty, label %miss, label %load
load:
  %entries.slot = getelementptr i8, ptr %object, i64 16
  %entries = load ptr, ptr %entries.slot
  %value.slot = getelementptr i8, ptr %entries, i64 16
  %value = load i64, ptr %value.slot
  %raw = call { ptr, i64 } @valueToString(i64 %value)
  ret { ptr, i64 } %raw
miss:
  ret { ptr, i64 } { ptr null, i64 0 }
}
