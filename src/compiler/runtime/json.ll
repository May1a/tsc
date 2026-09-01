define { ptr, i64 } @jsonQuote(i64 %len, ptr %p) {
entry:
  %worst = mul i64 %len, 6
  %alloc = add i64 %worst, 3
  %out = call ptr @malloc(i64 %alloc)
  store i8 34, ptr %out
  br label %loop
loop:
  %i = phi i64 [ 0, %entry ], [ %i.next, %advance ]
  %o = phi i64 [ 1, %entry ], [ %o.next, %advance ]
  %done = icmp eq i64 %i, %len
  br i1 %done, label %close, label %body
body:
  %c.ptr = getelementptr i8, ptr %p, i64 %i
  %c = load i8, ptr %c.ptr
  switch i8 %c, label %check.control [
    i8 34, label %escape.quote
    i8 92, label %escape.backslash
    i8 10, label %escape.n
    i8 13, label %escape.r
    i8 9, label %escape.t
    i8 8, label %escape.b
    i8 12, label %escape.f
  ]
escape.quote:
  br label %two.char
escape.backslash:
  br label %two.char
escape.n:
  br label %two.char
escape.r:
  br label %two.char
escape.t:
  br label %two.char
escape.b:
  br label %two.char
escape.f:
  br label %two.char
two.char:
  %escaped = phi i8 [ 34, %escape.quote ], [ 92, %escape.backslash ], [ 110, %escape.n ], [ 114, %escape.r ], [ 116, %escape.t ], [ 98, %escape.b ], [ 102, %escape.f ]
  %two.slot = getelementptr i8, ptr %out, i64 %o
  store i8 92, ptr %two.slot
  %two.o1 = add i64 %o, 1
  %two.slot1 = getelementptr i8, ptr %out, i64 %two.o1
  store i8 %escaped, ptr %two.slot1
  %two.o.next = add i64 %o, 2
  br label %advance
check.control:
  %is.control = icmp ult i8 %c, 32
  br i1 %is.control, label %unicode, label %plain
unicode:
  %u.slot0 = getelementptr i8, ptr %out, i64 %o
  store i8 92, ptr %u.slot0
  %u.o1 = add i64 %o, 1
  %u.slot1 = getelementptr i8, ptr %out, i64 %u.o1
  store i8 117, ptr %u.slot1
  %u.o2 = add i64 %o, 2
  %u.slot2 = getelementptr i8, ptr %out, i64 %u.o2
  store i8 48, ptr %u.slot2
  %u.o3 = add i64 %o, 3
  %u.slot3 = getelementptr i8, ptr %out, i64 %u.o3
  store i8 48, ptr %u.slot3
  %hi = lshr i8 %c, 4
  %hi.small = icmp ult i8 %hi, 10
  %hi.digit.base = select i1 %hi.small, i8 48, i8 87
  %hi.digit = add i8 %hi.digit.base, %hi
  %u.o4 = add i64 %o, 4
  %u.slot4 = getelementptr i8, ptr %out, i64 %u.o4
  store i8 %hi.digit, ptr %u.slot4
  %lo = and i8 %c, 15
  %lo.small = icmp ult i8 %lo, 10
  %lo.digit.base = select i1 %lo.small, i8 48, i8 87
  %lo.digit = add i8 %lo.digit.base, %lo
  %u.o5 = add i64 %o, 5
  %u.slot5 = getelementptr i8, ptr %out, i64 %u.o5
  store i8 %lo.digit, ptr %u.slot5
  %u.o.next = add i64 %o, 6
  br label %advance
plain:
  %plain.slot = getelementptr i8, ptr %out, i64 %o
  store i8 %c, ptr %plain.slot
  %plain.o.next = add i64 %o, 1
  br label %advance
advance:
  %o.next = phi i64 [ %two.o.next, %two.char ], [ %u.o.next, %unicode ], [ %plain.o.next, %plain ]
  %i.next = add i64 %i, 1
  br label %loop
close:
  %close.slot = getelementptr i8, ptr %out, i64 %o
  store i8 34, ptr %close.slot
  %total = add i64 %o, 1
  %nul.slot = getelementptr i8, ptr %out, i64 %total
  store i8 0, ptr %nul.slot
  %result.0 = insertvalue { ptr, i64 } undef, ptr %out, 0
  %result.1 = insertvalue { ptr, i64 } %result.0, i64 %total, 1
  ret { ptr, i64 } %result.1
}
define { ptr, i64 } @jsonPad(i64 %indent, i64 %depth) {
entry:
  %count = mul i64 %indent, %depth
  %alloc = add i64 %count, 1
  %out = call ptr @malloc(i64 %alloc)
  br label %loop
loop:
  %i = phi i64 [ 0, %entry ], [ %next, %body ]
  %done = icmp eq i64 %i, %count
  br i1 %done, label %exit, label %body
body:
  %slot = getelementptr i8, ptr %out, i64 %i
  store i8 32, ptr %slot
  %next = add i64 %i, 1
  br label %loop
exit:
  %nul.slot = getelementptr i8, ptr %out, i64 %count
  store i8 0, ptr %nul.slot
  %result.0 = insertvalue { ptr, i64 } undef, ptr %out, 0
  %result.1 = insertvalue { ptr, i64 } %result.0, i64 %count, 1
  ret { ptr, i64 } %result.1
}
define i1 @jsonFilterHas(ptr %filter, i64 %key.len, ptr %key.ptr) {
entry:
  %length = call i64 @arrayLength(ptr %filter)
  br label %loop
loop:
  %i = phi i64 [ 0, %entry ], [ %next, %advance ]
  %done = icmp eq i64 %i, %length
  br i1 %done, label %missing, label %body
body:
  %entry.value = call i64 @arrayGet(ptr %filter, i64 %i)
  %tagged = and i64 %entry.value, -281474976710656
  %is.string = icmp eq i64 %tagged, 9221683186994511872
  br i1 %is.string, label %compare.len, label %advance
compare.len:
  %entry.len = call i64 @valueStringLength(i64 %entry.value)
  %same.len = icmp eq i64 %entry.len, %key.len
  br i1 %same.len, label %compare, label %advance
compare:
  %entry.ptr = call ptr @valueStringPtr(i64 %entry.value)
  %cmp = call i32 @memcmp(ptr %entry.ptr, ptr %key.ptr, i64 %key.len)
  %same = icmp eq i32 %cmp, 0
  br i1 %same, label %found, label %advance
found:
  ret i1 true
advance:
  %next = add i64 %i, 1
  br label %loop
missing:
  ret i1 false
}
define { ptr, i64, i64, i1 } @jsonStrOk(ptr %json.ptr, i64 %json.len) {
entry:
  %r.0 = insertvalue { ptr, i64, i64, i1 } undef, ptr %json.ptr, 0
  %r.1 = insertvalue { ptr, i64, i64, i1 } %r.0, i64 %json.len, 1
  %r.2 = insertvalue { ptr, i64, i64, i1 } %r.1, i64 0, 2
  %r.3 = insertvalue { ptr, i64, i64, i1 } %r.2, i1 false, 3
  ret { ptr, i64, i64, i1 } %r.3
}
define { ptr, i64, i64, i1 } @jsonStrThrow(i64 %error) {
entry:
  %r.0 = insertvalue { ptr, i64, i64, i1 } undef, ptr null, 0
  %r.1 = insertvalue { ptr, i64, i64, i1 } %r.0, i64 0, 1
  %r.2 = insertvalue { ptr, i64, i64, i1 } %r.1, i64 %error, 2
  %r.3 = insertvalue { ptr, i64, i64, i1 } %r.2, i1 true, 3
  ret { ptr, i64, i64, i1 } %r.3
}
define i1 @jsonStackHasValue(ptr %stack, i64 %value) {
entry:
  %length = call i64 @arrayLength(ptr %stack)
  br label %loop
loop:
  %i = phi i64 [ 0, %entry ], [ %i.next, %advance ]
  %done = icmp eq i64 %i, %length
  br i1 %done, label %missing, label %check
check:
  %candidate = call i64 @arrayGet(ptr %stack, i64 %i)
  %same = icmp eq i64 %candidate, %value
  br i1 %same, label %found, label %advance
advance:
  %i.next = add i64 %i, 1
  br label %loop
found:
  ret i1 true
missing:
  ret i1 false
}
@.jsonstr.tojson.key = private unnamed_addr constant [7 x i8] c"toJSON\00"

define { ptr, i64, i64, i1 } @jsonStringifyValue(i64 %value, ptr %filter, i64 %indent, i64 %depth, ptr %stack, i64 %key) {
entry:
  %tagged = and i64 %value, -281474976710656
  %is.object = icmp eq i64 %tagged, 9221120237041090560
  %is.array = icmp eq i64 %tagged, 9221401712017801216
  %is.container = or i1 %is.object, %is.array
  br i1 %is.container, label %check.tojson, label %inner
check.tojson:
  %tojson = call i64 @valuePropertyGet(i64 %value, i64 6, ptr @.jsonstr.tojson.key)
  %is.fn = call i1 @valueIsFunction(i64 %tojson)
  br i1 %is.fn, label %call.tojson, label %inner
call.tojson:
  %argv = alloca i64, i64 1
  %arg0 = getelementptr i64, ptr %argv, i64 0
  store i64 %key, ptr %arg0
  %call = call { i64, i1 } @jsCall(i64 %tojson, i64 1, ptr %argv, i64 %value)
  %call.value = extractvalue { i64, i1 } %call, 0
  %call.thrown = extractvalue { i64, i1 } %call, 1
  br i1 %call.thrown, label %throw, label %inner.with
throw:
  %thrown = call { ptr, i64, i64, i1 } @jsonStrThrow(i64 %call.value)
  ret { ptr, i64, i64, i1 } %thrown
inner.with:
  br label %inner
inner:
  %resolved = phi i64 [ %value, %entry ], [ %value, %check.tojson ], [ %call.value, %inner.with ]
  %out = call { ptr, i64, i64, i1 } @jsonStringifyInner(i64 %resolved, ptr %filter, i64 %indent, i64 %depth, ptr %stack)
  ret { ptr, i64, i64, i1 } %out
}
@.json.null = private unnamed_addr constant [5 x i8] c"null\00"
@.json.true = private unnamed_addr constant [5 x i8] c"true\00"
@.json.false = private unnamed_addr constant [6 x i8] c"false\00"
@.json.cycle.error.name = private unnamed_addr constant [10 x i8] c"TypeError\00"
@.json.cycle.error.message = private unnamed_addr constant [38 x i8] c"Converting circular structure to JSON\00"
@.json.fmt.number = private unnamed_addr constant [3 x i8] c"%g\00"

define { ptr, i64, i64, i1 } @jsonStringifyInner(i64 %value, ptr %filter, i64 %indent, i64 %depth, ptr %stack) {
entry:
  %is.undefined = icmp eq i64 %value, 9222246136947933184
  br i1 %is.undefined, label %skip, label %check.null
skip:
  %skip.r = call { ptr, i64, i64, i1 } @jsonStrOk(ptr null, i64 0)
  ret { ptr, i64, i64, i1 } %skip.r
check.null:
  %is.null = icmp eq i64 %value, 9222246136947933187
  br i1 %is.null, label %null, label %check.true
null:
  %null.r = call { ptr, i64, i64, i1 } @jsonStrOk(ptr @.json.null, i64 4)
  ret { ptr, i64, i64, i1 } %null.r
check.true:
  %is.true = icmp eq i64 %value, 9222246136947933186
  br i1 %is.true, label %true, label %check.false
true:
  %true.r = call { ptr, i64, i64, i1 } @jsonStrOk(ptr @.json.true, i64 4)
  ret { ptr, i64, i64, i1 } %true.r
check.false:
  %is.false = icmp eq i64 %value, 9222246136947933185
  br i1 %is.false, label %false, label %check.string
false:
  %false.r = call { ptr, i64, i64, i1 } @jsonStrOk(ptr @.json.false, i64 5)
  ret { ptr, i64, i64, i1 } %false.r
check.string:
  %tagged = and i64 %value, -281474976710656
  %is.string = icmp eq i64 %tagged, 9221683186994511872
  br i1 %is.string, label %string, label %check.object
string:
  %string.len = call i64 @valueStringLength(i64 %value)
  %string.ptr = call ptr @valueStringPtr(i64 %value)
  %quoted = call { ptr, i64 } @jsonQuote(i64 %string.len, ptr %string.ptr)
  %quoted.ptr = extractvalue { ptr, i64 } %quoted, 0
  %quoted.len = extractvalue { ptr, i64 } %quoted, 1
  %string.r = call { ptr, i64, i64, i1 } @jsonStrOk(ptr %quoted.ptr, i64 %quoted.len)
  ret { ptr, i64, i64, i1 } %string.r
check.object:
  %is.object = icmp eq i64 %tagged, 9221120237041090560
  br i1 %is.object, label %object, label %check.array
object:
  %object.ptr = call ptr @valueObjectPtr(i64 %value)
  %object.hit = call i1 @jsonStackHasValue(ptr %stack, i64 %value)
  br i1 %object.hit, label %cycle, label %object.go
object.go:
  %object.push = call i64 @arrayPush(ptr %stack, i64 %value)
  %next.depth.obj = add i64 %depth, 1
  %object.json = call { ptr, i64, i64, i1 } @jsonStringifyObject(ptr %object.ptr, ptr %filter, i64 %indent, i64 %next.depth.obj, ptr %stack)
  %object.pop = call i64 @arrayPop(ptr %stack)
  ret { ptr, i64, i64, i1 } %object.json
check.array:
  %is.array = icmp eq i64 %tagged, 9221401712017801216
  br i1 %is.array, label %array, label %number
array:
  %array.ptr = call ptr @valueArrayPtr(i64 %value)
  %array.hit = call i1 @jsonStackHasValue(ptr %stack, i64 %value)
  br i1 %array.hit, label %cycle, label %array.go
array.go:
  %array.push = call i64 @arrayPush(ptr %stack, i64 %value)
  %next.depth.arr = add i64 %depth, 1
  %array.json = call { ptr, i64, i64, i1 } @jsonStringifyArray(ptr %array.ptr, ptr %filter, i64 %indent, i64 %next.depth.arr, ptr %stack)
  %array.pop = call i64 @arrayPop(ptr %stack)
  ret { ptr, i64, i64, i1 } %array.json
cycle:
  %cycle.msg = call i64 @valueBoxString(ptr @.json.cycle.error.message, i64 37)
  %cycle.err = call ptr @errorNew(i64 2, i64 9, ptr @.json.cycle.error.name, i64 %cycle.msg)
  %cycle.value = call i64 @valueBoxObject(ptr %cycle.err)
  %cycle.r = call { ptr, i64, i64, i1 } @jsonStrThrow(i64 %cycle.value)
  ret { ptr, i64, i64, i1 } %cycle.r
number:
  %number.value = call double @valueNumber(i64 %value)
  %is.nan = fcmp uno double %number.value, %number.value
  br i1 %is.nan, label %null, label %check.infinite
check.infinite:
  %abs.bits = and i64 %value, 9223372036854775807
  %is.infinite = icmp eq i64 %abs.bits, 9218868437227405312
  br i1 %is.infinite, label %null, label %finite
finite:
  %buffer = call ptr @malloc(i64 32)
  %written = call i32 (ptr, ptr, ...) @sprintf(ptr %buffer, ptr @.json.fmt.number, double %number.value)
  %written.len = sext i32 %written to i64
  %finite.r = call { ptr, i64, i64, i1 } @jsonStrOk(ptr %buffer, i64 %written.len)
  ret { ptr, i64, i64, i1 } %finite.r
}
@.json.arr.null = private unnamed_addr constant [5 x i8] c"null\00"
@.json.arr.open = private unnamed_addr constant [2 x i8] c"[\00"
@.json.arr.close = private unnamed_addr constant [2 x i8] c"]\00"
@.json.arr.comma = private unnamed_addr constant [2 x i8] c",\00"
@.json.arr.newline = private unnamed_addr constant [2 x i8] c"\0A\00"

define { ptr, i64, i64, i1 } @jsonStringifyArray(ptr %array, ptr %filter, i64 %indent, i64 %depth, ptr %stack) {
entry:
  %length = call i64 @arrayLength(ptr %array)
  %empty = icmp eq i64 %length, 0
  br i1 %empty, label %empty.result, label %setup
empty.result:
  %empty.str = call ptr @strConcat(i64 1, ptr @.json.arr.open, i64 1, ptr @.json.arr.close)
  %empty.r = call { ptr, i64, i64, i1 } @jsonStrOk(ptr %empty.str, i64 2)
  ret { ptr, i64, i64, i1 } %empty.r
setup:
  %pretty = icmp ugt i64 %indent, 0
  %pad = call { ptr, i64 } @jsonPad(i64 %indent, i64 %depth)
  %pad.ptr = extractvalue { ptr, i64 } %pad, 0
  %pad.len = extractvalue { ptr, i64 } %pad, 1
  %parent.depth = sub i64 %depth, 1
  %close.pad = call { ptr, i64 } @jsonPad(i64 %indent, i64 %parent.depth)
  %close.pad.ptr = extractvalue { ptr, i64 } %close.pad, 0
  %close.pad.len = extractvalue { ptr, i64 } %close.pad, 1
  br label %loop
loop:
  %i = phi i64 [ 0, %setup ], [ %i.next, %append ]
  %acc.ptr = phi ptr [ @.json.arr.open, %setup ], [ %next.acc.ptr, %append ]
  %acc.len = phi i64 [ 1, %setup ], [ %next.acc.len, %append ]
  %done = icmp eq i64 %i, %length
  br i1 %done, label %finish, label %element
element:
  %elem.value = call i64 @arrayGet(ptr %array, i64 %i)
  %elem.key.ptr = call ptr @indexToString(i64 %i)
  %elem.key.len = call i64 @strlen(ptr %elem.key.ptr)
  %elem.key = call i64 @valueBoxString(ptr %elem.key.ptr, i64 %elem.key.len)
  %elem.r = call { ptr, i64, i64, i1 } @jsonStringifyValue(i64 %elem.value, ptr %filter, i64 %indent, i64 %depth, ptr %stack, i64 %elem.key)
  %elem.thrown = extractvalue { ptr, i64, i64, i1 } %elem.r, 3
  br i1 %elem.thrown, label %propagate, label %element.ok
propagate:
  ret { ptr, i64, i64, i1 } %elem.r
element.ok:
  %elem.ptr.raw = extractvalue { ptr, i64, i64, i1 } %elem.r, 0
  %elem.len.raw = extractvalue { ptr, i64, i64, i1 } %elem.r, 1
  %elem.skipped = icmp eq ptr %elem.ptr.raw, null
  %elem.ptr = select i1 %elem.skipped, ptr @.json.arr.null, ptr %elem.ptr.raw
  %elem.len = select i1 %elem.skipped, i64 4, i64 %elem.len.raw
  %first = icmp eq i64 %i, 0
  br i1 %first, label %separator.done, label %separator
separator:
  %with.comma = call ptr @strConcat(i64 %acc.len, ptr %acc.ptr, i64 1, ptr @.json.arr.comma)
  %with.comma.len = add i64 %acc.len, 1
  br label %separator.done
separator.done:
  %sep.ptr = phi ptr [ %acc.ptr, %element.ok ], [ %with.comma, %separator ]
  %sep.len = phi i64 [ %acc.len, %element.ok ], [ %with.comma.len, %separator ]
  br i1 %pretty, label %pad.element, label %plain.element
pad.element:
  %with.nl = call ptr @strConcat(i64 %sep.len, ptr %sep.ptr, i64 1, ptr @.json.arr.newline)
  %with.nl.len = add i64 %sep.len, 1
  %with.pad = call ptr @strConcat(i64 %with.nl.len, ptr %with.nl, i64 %pad.len, ptr %pad.ptr)
  %with.pad.len = add i64 %with.nl.len, %pad.len
  br label %emit
plain.element:
  br label %emit
emit:
  %emit.ptr = phi ptr [ %with.pad, %pad.element ], [ %sep.ptr, %plain.element ]
  %emit.len = phi i64 [ %with.pad.len, %pad.element ], [ %sep.len, %plain.element ]
  %appended = call ptr @strConcat(i64 %emit.len, ptr %emit.ptr, i64 %elem.len, ptr %elem.ptr)
  %appended.len = add i64 %emit.len, %elem.len
  br label %append
append:
  %next.acc.ptr = phi ptr [ %appended, %emit ]
  %next.acc.len = phi i64 [ %appended.len, %emit ]
  %i.next = add i64 %i, 1
  br label %loop
finish:
  br i1 %pretty, label %finish.pretty, label %finish.plain
finish.pretty:
  %final.nl = call ptr @strConcat(i64 %acc.len, ptr %acc.ptr, i64 1, ptr @.json.arr.newline)
  %final.nl.len = add i64 %acc.len, 1
  %final.pad = call ptr @strConcat(i64 %final.nl.len, ptr %final.nl, i64 %close.pad.len, ptr %close.pad.ptr)
  %final.pad.len = add i64 %final.nl.len, %close.pad.len
  br label %close
finish.plain:
  br label %close
close:
  %close.in.ptr = phi ptr [ %final.pad, %finish.pretty ], [ %acc.ptr, %finish.plain ]
  %close.in.len = phi i64 [ %final.pad.len, %finish.pretty ], [ %acc.len, %finish.plain ]
  %closed = call ptr @strConcat(i64 %close.in.len, ptr %close.in.ptr, i64 1, ptr @.json.arr.close)
  %closed.len = add i64 %close.in.len, 1
  %closed.r = call { ptr, i64, i64, i1 } @jsonStrOk(ptr %closed, i64 %closed.len)
  ret { ptr, i64, i64, i1 } %closed.r
}
@.json.obj.open = private unnamed_addr constant [2 x i8] c"{\00"
@.json.obj.close = private unnamed_addr constant [2 x i8] c"}\00"
@.json.obj.comma = private unnamed_addr constant [2 x i8] c",\00"
@.json.obj.newline = private unnamed_addr constant [2 x i8] c"\0A\00"
@.json.obj.colon = private unnamed_addr constant [2 x i8] c":\00"
@.json.obj.colon.space = private unnamed_addr constant [3 x i8] c": \00"

define { ptr, i64, i64, i1 } @jsonStringifyObject(ptr %object, ptr %filter, i64 %indent, i64 %depth, ptr %stack) {
entry:
  %count = load i64, ptr %object
  %entries.slot = getelementptr i8, ptr %object, i64 16
  %entries = load ptr, ptr %entries.slot
  %pretty = icmp ugt i64 %indent, 0
  %pad = call { ptr, i64 } @jsonPad(i64 %indent, i64 %depth)
  %pad.ptr = extractvalue { ptr, i64 } %pad, 0
  %pad.len = extractvalue { ptr, i64 } %pad, 1
  %parent.depth = sub i64 %depth, 1
  %close.pad = call { ptr, i64 } @jsonPad(i64 %indent, i64 %parent.depth)
  %close.pad.ptr = extractvalue { ptr, i64 } %close.pad, 0
  %close.pad.len = extractvalue { ptr, i64 } %close.pad, 1
  br label %loop
loop:
  %i = phi i64 [ 0, %entry ], [ %i.next, %advance ]
  %acc.ptr = phi ptr [ @.json.obj.open, %entry ], [ %next.acc.ptr, %advance ]
  %acc.len = phi i64 [ 1, %entry ], [ %next.acc.len, %advance ]
  %emitted = phi i64 [ 0, %entry ], [ %next.emitted, %advance ]
  %done = icmp eq i64 %i, %count
  br i1 %done, label %finish, label %body
body:
  %entry.bytes = mul i64 %i, 32
  %entry.ptr = getelementptr i8, ptr %entries, i64 %entry.bytes
  %entry.key.len = load i64, ptr %entry.ptr
  %entry.active = icmp sge i64 %entry.key.len, 0
  br i1 %entry.active, label %check.enumerable, label %skip
check.enumerable:
  %descriptor.slot = getelementptr i8, ptr %entry.ptr, i64 24
  %descriptor = load i64, ptr %descriptor.slot
  %enumerable.bit = and i64 %descriptor, 2
  %is.enumerable = icmp ne i64 %enumerable.bit, 0
  br i1 %is.enumerable, label %check.filter, label %skip
check.filter:
  %key.len = load i64, ptr %entry.ptr
  %key.slot = getelementptr i8, ptr %entry.ptr, i64 8
  %key.ptr = load ptr, ptr %key.slot
  %no.filter = icmp eq ptr %filter, null
  br i1 %no.filter, label %stringify, label %filter.check
filter.check:
  %in.filter = call i1 @jsonFilterHas(ptr %filter, i64 %key.len, ptr %key.ptr)
  br i1 %in.filter, label %stringify, label %skip
stringify:
  %value.slot = getelementptr i8, ptr %entry.ptr, i64 16
  %entry.value = load i64, ptr %value.slot
  %entry.key = call i64 @valueBoxString(ptr %key.ptr, i64 %key.len)
  %value.r = call { ptr, i64, i64, i1 } @jsonStringifyValue(i64 %entry.value, ptr %filter, i64 %indent, i64 %depth, ptr %stack, i64 %entry.key)
  %value.thrown = extractvalue { ptr, i64, i64, i1 } %value.r, 3
  br i1 %value.thrown, label %propagate, label %stringify.ok
propagate:
  ret { ptr, i64, i64, i1 } %value.r
stringify.ok:
  %value.ptr = extractvalue { ptr, i64, i64, i1 } %value.r, 0
  %value.len = extractvalue { ptr, i64, i64, i1 } %value.r, 1
  %value.skipped = icmp eq ptr %value.ptr, null
  br i1 %value.skipped, label %skip, label %emit.pair
emit.pair:
  %first = icmp eq i64 %emitted, 0
  br i1 %first, label %separator.done, label %separator
separator:
  %with.comma = call ptr @strConcat(i64 %acc.len, ptr %acc.ptr, i64 1, ptr @.json.obj.comma)
  %with.comma.len = add i64 %acc.len, 1
  br label %separator.done
separator.done:
  %sep.ptr = phi ptr [ %acc.ptr, %emit.pair ], [ %with.comma, %separator ]
  %sep.len = phi i64 [ %acc.len, %emit.pair ], [ %with.comma.len, %separator ]
  br i1 %pretty, label %pad.pair, label %plain.pair
pad.pair:
  %with.nl = call ptr @strConcat(i64 %sep.len, ptr %sep.ptr, i64 1, ptr @.json.obj.newline)
  %with.nl.len = add i64 %sep.len, 1
  %with.pad = call ptr @strConcat(i64 %with.nl.len, ptr %with.nl, i64 %pad.len, ptr %pad.ptr)
  %with.pad.len = add i64 %with.nl.len, %pad.len
  br label %emit.key
plain.pair:
  br label %emit.key
emit.key:
  %base.ptr = phi ptr [ %with.pad, %pad.pair ], [ %sep.ptr, %plain.pair ]
  %base.len = phi i64 [ %with.pad.len, %pad.pair ], [ %sep.len, %plain.pair ]
  %quoted.key = call { ptr, i64 } @jsonQuote(i64 %key.len, ptr %key.ptr)
  %quoted.key.ptr = extractvalue { ptr, i64 } %quoted.key, 0
  %quoted.key.len = extractvalue { ptr, i64 } %quoted.key, 1
  %with.key = call ptr @strConcat(i64 %base.len, ptr %base.ptr, i64 %quoted.key.len, ptr %quoted.key.ptr)
  %with.key.len = add i64 %base.len, %quoted.key.len
  %colon.ptr = select i1 %pretty, ptr @.json.obj.colon.space, ptr @.json.obj.colon
  %colon.len = select i1 %pretty, i64 2, i64 1
  %with.colon = call ptr @strConcat(i64 %with.key.len, ptr %with.key, i64 %colon.len, ptr %colon.ptr)
  %with.colon.len = add i64 %with.key.len, %colon.len
  %with.value = call ptr @strConcat(i64 %with.colon.len, ptr %with.colon, i64 %value.len, ptr %value.ptr)
  %with.value.len = add i64 %with.colon.len, %value.len
  br label %advance
skip:
  br label %advance
advance:
  %next.acc.ptr = phi ptr [ %with.value, %emit.key ], [ %acc.ptr, %skip ]
  %next.acc.len = phi i64 [ %with.value.len, %emit.key ], [ %acc.len, %skip ]
  %emitted.increment = phi i64 [ 1, %emit.key ], [ 0, %skip ]
  %next.emitted = add i64 %emitted, %emitted.increment
  %i.next = add i64 %i, 1
  br label %loop
finish:
  %has.pairs = icmp ugt i64 %emitted, 0
  %wants.pretty.close = and i1 %pretty, %has.pairs
  br i1 %wants.pretty.close, label %finish.pretty, label %finish.plain
finish.pretty:
  %final.nl = call ptr @strConcat(i64 %acc.len, ptr %acc.ptr, i64 1, ptr @.json.obj.newline)
  %final.nl.len = add i64 %acc.len, 1
  %final.pad = call ptr @strConcat(i64 %final.nl.len, ptr %final.nl, i64 %close.pad.len, ptr %close.pad.ptr)
  %final.pad.len = add i64 %final.nl.len, %close.pad.len
  br label %close
finish.plain:
  br label %close
close:
  %close.in.ptr = phi ptr [ %final.pad, %finish.pretty ], [ %acc.ptr, %finish.plain ]
  %close.in.len = phi i64 [ %final.pad.len, %finish.pretty ], [ %acc.len, %finish.plain ]
  %closed = call ptr @strConcat(i64 %close.in.len, ptr %close.in.ptr, i64 1, ptr @.json.obj.close)
  %closed.len = add i64 %close.in.len, 1
  %closed.r = call { ptr, i64, i64, i1 } @jsonStrOk(ptr %closed, i64 %closed.len)
  ret { ptr, i64, i64, i1 } %closed.r
}
@.jsonstr.empty.key = private unnamed_addr constant [1 x i8] c"\00"

define { i64, i1 } @jsonStringify(i64 %value, ptr %filter, i64 %indent) {
entry:
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %value)
  %stack = call ptr @arrayNew(i64 0)
  %stack.boxed = call i64 @valueBoxArray(ptr %stack)
  call void @gcRootPush(i64 %stack.boxed)
  %key = call i64 @valueBoxString(ptr @.jsonstr.empty.key, i64 0)
  %r = call { ptr, i64, i64, i1 } @jsonStringifyValue(i64 %value, ptr %filter, i64 %indent, i64 0, ptr %stack, i64 %key)
  %thrown = extractvalue { ptr, i64, i64, i1 } %r, 3
  br i1 %thrown, label %fail, label %check.skip
check.skip:
  %json.ptr = extractvalue { ptr, i64, i64, i1 } %r, 0
  %json.len = extractvalue { ptr, i64, i64, i1 } %r, 1
  %skipped = icmp eq ptr %json.ptr, null
  br i1 %skipped, label %undefined, label %boxed
undefined:
  call void @gcRootRestore(i64 %frame)
  %u.0 = insertvalue { i64, i1 } undef, i64 9222246136947933184, 0
  %u.1 = insertvalue { i64, i1 } %u.0, i1 false, 1
  ret { i64, i1 } %u.1
boxed:
  %result = call i64 @valueBoxString(ptr %json.ptr, i64 %json.len)
  call void @gcRootRestore(i64 %frame)
  %b.0 = insertvalue { i64, i1 } undef, i64 %result, 0
  %b.1 = insertvalue { i64, i1 } %b.0, i1 false, 1
  ret { i64, i1 } %b.1
fail:
  %error = extractvalue { ptr, i64, i64, i1 } %r, 2
  call void @gcRootRestore(i64 %frame)
  %f.0 = insertvalue { i64, i1 } undef, i64 %error, 0
  %f.1 = insertvalue { i64, i1 } %f.0, i1 true, 1
  ret { i64, i1 } %f.1
}
define void @jsonSkipWhitespace(ptr %p, i64 %len, ptr %pos.addr) {
entry:
  br label %loop
loop:
  %pos = load i64, ptr %pos.addr
  %at.end = icmp uge i64 %pos, %len
  br i1 %at.end, label %done, label %check
check:
  %c.ptr = getelementptr i8, ptr %p, i64 %pos
  %c = load i8, ptr %c.ptr
  %is.space = icmp eq i8 %c, 32
  %is.tab = icmp eq i8 %c, 9
  %is.nl = icmp eq i8 %c, 10
  %is.cr = icmp eq i8 %c, 13
  %ws.0 = or i1 %is.space, %is.tab
  %ws.1 = or i1 %is.nl, %is.cr
  %is.ws = or i1 %ws.0, %ws.1
  br i1 %is.ws, label %advance, label %done
advance:
  %next = add i64 %pos, 1
  store i64 %next, ptr %pos.addr
  br label %loop
done:
  ret void
}
define i1 @jsonMatchLiteral(ptr %p, i64 %len, ptr %pos.addr, ptr %lit, i64 %lit.len) {
entry:
  %pos = load i64, ptr %pos.addr
  %end = add i64 %pos, %lit.len
  %fits = icmp ule i64 %end, %len
  br i1 %fits, label %compare, label %no
compare:
  %cur = getelementptr i8, ptr %p, i64 %pos
  %cmp = call i32 @memcmp(ptr %cur, ptr %lit, i64 %lit.len)
  %same = icmp eq i32 %cmp, 0
  br i1 %same, label %yes, label %no
yes:
  store i64 %end, ptr %pos.addr
  ret i1 true
no:
  ret i1 false
}
define i64 @jsonHex4(ptr %p, i64 %start) {
entry:
  %v.addr = alloca i64
  store i64 0, ptr %v.addr
  %i.addr = alloca i64
  store i64 0, ptr %i.addr
  br label %loop
loop:
  %i = load i64, ptr %i.addr
  %done = icmp eq i64 %i, 4
  br i1 %done, label %finish, label %read
read:
  %at = add i64 %start, %i
  %c.ptr = getelementptr i8, ptr %p, i64 %at
  %c = load i8, ptr %c.ptr
  %c.wide = zext i8 %c to i64
  %is.digit.lo = icmp uge i8 %c, 48
  %is.digit.hi = icmp ule i8 %c, 57
  %is.digit = and i1 %is.digit.lo, %is.digit.hi
  br i1 %is.digit, label %digit, label %check.lower
check.lower:
  %is.lower.lo = icmp uge i8 %c, 97
  %is.lower.hi = icmp ule i8 %c, 102
  %is.lower = and i1 %is.lower.lo, %is.lower.hi
  br i1 %is.lower, label %lower, label %check.upper
check.upper:
  %is.upper.lo = icmp uge i8 %c, 65
  %is.upper.hi = icmp ule i8 %c, 70
  %is.upper = and i1 %is.upper.lo, %is.upper.hi
  br i1 %is.upper, label %upper, label %invalid
digit:
  %d.value = sub i64 %c.wide, 48
  br label %accumulate
lower:
  %l.value = sub i64 %c.wide, 87
  br label %accumulate
upper:
  %u.value = sub i64 %c.wide, 55
  br label %accumulate
accumulate:
  %hex.digit = phi i64 [ %d.value, %digit ], [ %l.value, %lower ], [ %u.value, %upper ]
  %v = load i64, ptr %v.addr
  %v.shifted = mul i64 %v, 16
  %v.next = add i64 %v.shifted, %hex.digit
  store i64 %v.next, ptr %v.addr
  %i.next = add i64 %i, 1
  store i64 %i.next, ptr %i.addr
  br label %loop
finish:
  %result = load i64, ptr %v.addr
  ret i64 %result
invalid:
  ret i64 -1
}
define { ptr, i64, i1 } @jsonParseString(ptr %p, i64 %len, ptr %pos.addr) {
entry:
  %cap = add i64 %len, 1
  %buf = call ptr @malloc(i64 %cap)
  %out.addr = alloca i64
  store i64 0, ptr %out.addr
  br label %loop
loop:
  %pos = load i64, ptr %pos.addr
  %at.end = icmp uge i64 %pos, %len
  br i1 %at.end, label %error, label %read
read:
  %c.ptr = getelementptr i8, ptr %p, i64 %pos
  %c = load i8, ptr %c.ptr
  %is.quote = icmp eq i8 %c, 34
  br i1 %is.quote, label %close, label %check.escape
check.escape:
  %is.backslash = icmp eq i8 %c, 92
  br i1 %is.backslash, label %escape, label %check.control
check.control:
  %is.control = icmp ult i8 %c, 32
  br i1 %is.control, label %error, label %copy
copy:
  %out = load i64, ptr %out.addr
  %slot = getelementptr i8, ptr %buf, i64 %out
  store i8 %c, ptr %slot
  %out.next = add i64 %out, 1
  store i64 %out.next, ptr %out.addr
  %pos.next = add i64 %pos, 1
  store i64 %pos.next, ptr %pos.addr
  br label %loop
close:
  %close.next = add i64 %pos, 1
  store i64 %close.next, ptr %pos.addr
  %result.len = load i64, ptr %out.addr
  %r.0 = insertvalue { ptr, i64, i1 } undef, ptr %buf, 0
  %r.1 = insertvalue { ptr, i64, i1 } %r.0, i64 %result.len, 1
  %r.2 = insertvalue { ptr, i64, i1 } %r.1, i1 false, 2
  ret { ptr, i64, i1 } %r.2
escape:
  %esc.pos = add i64 %pos, 1
  %esc.at.end = icmp uge i64 %esc.pos, %len
  br i1 %esc.at.end, label %error, label %escape.read
escape.read:
  %ec.ptr = getelementptr i8, ptr %p, i64 %esc.pos
  %ec = load i8, ptr %ec.ptr
  %is.u = icmp eq i8 %ec, 117
  br i1 %is.u, label %unicode, label %escape.simple
escape.simple:
  %m.quote = icmp eq i8 %ec, 34
  %m.slash = icmp eq i8 %ec, 92
  %m.forward = icmp eq i8 %ec, 47
  %passthrough.0 = or i1 %m.quote, %m.slash
  %passthrough = or i1 %passthrough.0, %m.forward
  %m.b = icmp eq i8 %ec, 98
  %m.f = icmp eq i8 %ec, 102
  %m.n = icmp eq i8 %ec, 110
  %m.r = icmp eq i8 %ec, 114
  %m.t = icmp eq i8 %ec, 116
  %named.0 = or i1 %m.b, %m.f
  %named.1 = or i1 %m.n, %m.r
  %named.2 = or i1 %named.0, %named.1
  %named = or i1 %named.2, %m.t
  %valid = or i1 %passthrough, %named
  br i1 %valid, label %escape.byte, label %error
escape.byte:
  %v.b = select i1 %m.b, i8 8, i8 0
  %v.f = select i1 %m.f, i8 12, i8 %v.b
  %v.n = select i1 %m.n, i8 10, i8 %v.f
  %v.r = select i1 %m.r, i8 13, i8 %v.n
  %v.t = select i1 %m.t, i8 9, i8 %v.r
  %byte = select i1 %passthrough, i8 %ec, i8 %v.t
  %esc.out = load i64, ptr %out.addr
  %esc.slot = getelementptr i8, ptr %buf, i64 %esc.out
  store i8 %byte, ptr %esc.slot
  %esc.out.next = add i64 %esc.out, 1
  store i64 %esc.out.next, ptr %out.addr
  %esc.next = add i64 %esc.pos, 1
  store i64 %esc.next, ptr %pos.addr
  br label %loop
unicode:
  %hex.start = add i64 %esc.pos, 1
  %hex.end = add i64 %hex.start, 4
  %hex.fits = icmp ule i64 %hex.end, %len
  br i1 %hex.fits, label %hex.read, label %error
hex.read:
  %unit = call i64 @jsonHex4(ptr %p, i64 %hex.start)
  %unit.bad = icmp slt i64 %unit, 0
  br i1 %unit.bad, label %error, label %hex.ok
hex.ok:
  store i64 %hex.end, ptr %pos.addr
  %high.lo = icmp uge i64 %unit, 55296
  %high.hi = icmp ule i64 %unit, 56319
  %is.high = and i1 %high.lo, %high.hi
  br i1 %is.high, label %surrogate, label %encode.solo
surrogate:
  %s.pos = load i64, ptr %pos.addr
  %s.end = add i64 %s.pos, 6
  %s.fits = icmp ule i64 %s.end, %len
  br i1 %s.fits, label %surrogate.check, label %encode.solo
surrogate.check:
  %s.bs.ptr = getelementptr i8, ptr %p, i64 %s.pos
  %s.bs = load i8, ptr %s.bs.ptr
  %s.is.bs = icmp eq i8 %s.bs, 92
  br i1 %s.is.bs, label %surrogate.u, label %encode.solo
surrogate.u:
  %s.u.at = add i64 %s.pos, 1
  %s.u.ptr = getelementptr i8, ptr %p, i64 %s.u.at
  %s.u = load i8, ptr %s.u.ptr
  %s.is.u = icmp eq i8 %s.u, 117
  br i1 %s.is.u, label %surrogate.hex, label %encode.solo
surrogate.hex:
  %s.hex.start = add i64 %s.pos, 2
  %low = call i64 @jsonHex4(ptr %p, i64 %s.hex.start)
  %low.lo = icmp uge i64 %low, 56320
  %low.hi = icmp ule i64 %low, 57343
  %is.low = and i1 %low.lo, %low.hi
  br i1 %is.low, label %surrogate.combine, label %encode.solo
surrogate.combine:
  store i64 %s.end, ptr %pos.addr
  %high.part = sub i64 %unit, 55296
  %high.shifted = shl i64 %high.part, 10
  %low.part = sub i64 %low, 56320
  %pair.base = add i64 %high.shifted, %low.part
  %paired = add i64 %pair.base, 65536
  br label %encode
encode.solo:
  br label %encode
encode:
  %cp = phi i64 [ %paired, %surrogate.combine ], [ %unit, %encode.solo ]
  %lt.80 = icmp ult i64 %cp, 128
  br i1 %lt.80, label %enc1, label %check.enc2
check.enc2:
  %lt.800 = icmp ult i64 %cp, 2048
  br i1 %lt.800, label %enc2, label %check.enc3
check.enc3:
  %lt.10000 = icmp ult i64 %cp, 65536
  br i1 %lt.10000, label %enc3, label %enc4
enc1:
  %b1.0 = trunc i64 %cp to i8
  %o1 = load i64, ptr %out.addr
  %s1 = getelementptr i8, ptr %buf, i64 %o1
  store i8 %b1.0, ptr %s1
  %o1.next = add i64 %o1, 1
  store i64 %o1.next, ptr %out.addr
  br label %loop
enc2:
  %o2 = load i64, ptr %out.addr
  %hi2 = lshr i64 %cp, 6
  %b2.0.wide = or i64 %hi2, 192
  %b2.0 = trunc i64 %b2.0.wide to i8
  %s2.0 = getelementptr i8, ptr %buf, i64 %o2
  store i8 %b2.0, ptr %s2.0
  %lo2 = and i64 %cp, 63
  %b2.1.wide = or i64 %lo2, 128
  %b2.1 = trunc i64 %b2.1.wide to i8
  %o2.1 = add i64 %o2, 1
  %s2.1 = getelementptr i8, ptr %buf, i64 %o2.1
  store i8 %b2.1, ptr %s2.1
  %o2.next = add i64 %o2, 2
  store i64 %o2.next, ptr %out.addr
  br label %loop
enc3:
  %o3 = load i64, ptr %out.addr
  %hi3 = lshr i64 %cp, 12
  %b3.0.wide = or i64 %hi3, 224
  %b3.0 = trunc i64 %b3.0.wide to i8
  %s3.0 = getelementptr i8, ptr %buf, i64 %o3
  store i8 %b3.0, ptr %s3.0
  %mid3.shift = lshr i64 %cp, 6
  %mid3 = and i64 %mid3.shift, 63
  %b3.1.wide = or i64 %mid3, 128
  %b3.1 = trunc i64 %b3.1.wide to i8
  %o3.1 = add i64 %o3, 1
  %s3.1 = getelementptr i8, ptr %buf, i64 %o3.1
  store i8 %b3.1, ptr %s3.1
  %lo3 = and i64 %cp, 63
  %b3.2.wide = or i64 %lo3, 128
  %b3.2 = trunc i64 %b3.2.wide to i8
  %o3.2 = add i64 %o3, 2
  %s3.2 = getelementptr i8, ptr %buf, i64 %o3.2
  store i8 %b3.2, ptr %s3.2
  %o3.next = add i64 %o3, 3
  store i64 %o3.next, ptr %out.addr
  br label %loop
enc4:
  %o4 = load i64, ptr %out.addr
  %hi4 = lshr i64 %cp, 18
  %b4.0.wide = or i64 %hi4, 240
  %b4.0 = trunc i64 %b4.0.wide to i8
  %s4.0 = getelementptr i8, ptr %buf, i64 %o4
  store i8 %b4.0, ptr %s4.0
  %m4.shift = lshr i64 %cp, 12
  %m4 = and i64 %m4.shift, 63
  %b4.1.wide = or i64 %m4, 128
  %b4.1 = trunc i64 %b4.1.wide to i8
  %o4.1 = add i64 %o4, 1
  %s4.1 = getelementptr i8, ptr %buf, i64 %o4.1
  store i8 %b4.1, ptr %s4.1
  %l4.shift = lshr i64 %cp, 6
  %l4 = and i64 %l4.shift, 63
  %b4.2.wide = or i64 %l4, 128
  %b4.2 = trunc i64 %b4.2.wide to i8
  %o4.2 = add i64 %o4, 2
  %s4.2 = getelementptr i8, ptr %buf, i64 %o4.2
  store i8 %b4.2, ptr %s4.2
  %lo4 = and i64 %cp, 63
  %b4.3.wide = or i64 %lo4, 128
  %b4.3 = trunc i64 %b4.3.wide to i8
  %o4.3 = add i64 %o4, 3
  %s4.3 = getelementptr i8, ptr %buf, i64 %o4.3
  store i8 %b4.3, ptr %s4.3
  %o4.next = add i64 %o4, 4
  store i64 %o4.next, ptr %out.addr
  br label %loop
error:
  %e.0 = insertvalue { ptr, i64, i1 } undef, ptr null, 0
  %e.1 = insertvalue { ptr, i64, i1 } %e.0, i64 0, 1
  %e.2 = insertvalue { ptr, i64, i1 } %e.1, i1 true, 2
  ret { ptr, i64, i1 } %e.2
}
define { i64, i1 } @jsonParseNumber(ptr %p, i64 %len, ptr %pos.addr) {
entry:
  %start = load i64, ptr %pos.addr
  %c.ptr = getelementptr i8, ptr %p, i64 %start
  %c = load i8, ptr %c.ptr
  %is.minus = icmp eq i8 %c, 45
  br i1 %is.minus, label %minus, label %int
minus:
  %after.minus = add i64 %start, 1
  store i64 %after.minus, ptr %pos.addr
  br label %int
int:
  %i.pos = load i64, ptr %pos.addr
  %i.at.end = icmp uge i64 %i.pos, %len
  br i1 %i.at.end, label %error, label %int.read
int.read:
  %ic.ptr = getelementptr i8, ptr %p, i64 %i.pos
  %ic = load i8, ptr %ic.ptr
  %is.zero = icmp eq i8 %ic, 48
  br i1 %is.zero, label %int.zero, label %int.check.digit
int.zero:
  %zero.next = add i64 %i.pos, 1
  store i64 %zero.next, ptr %pos.addr
  br label %frac
int.check.digit:
  %d.lo = icmp uge i8 %ic, 49
  %d.hi = icmp ule i8 %ic, 57
  %is.d = and i1 %d.lo, %d.hi
  br i1 %is.d, label %int.loop, label %error
int.loop:
  %l.pos = load i64, ptr %pos.addr
  %l.at.end = icmp uge i64 %l.pos, %len
  br i1 %l.at.end, label %frac, label %int.loop.read
int.loop.read:
  %lc.ptr = getelementptr i8, ptr %p, i64 %l.pos
  %lc = load i8, ptr %lc.ptr
  %ld.lo = icmp uge i8 %lc, 48
  %ld.hi = icmp ule i8 %lc, 57
  %is.ld = and i1 %ld.lo, %ld.hi
  br i1 %is.ld, label %int.advance, label %frac
int.advance:
  %l.next = add i64 %l.pos, 1
  store i64 %l.next, ptr %pos.addr
  br label %int.loop
frac:
  %f.pos = load i64, ptr %pos.addr
  %f.at.end = icmp uge i64 %f.pos, %len
  br i1 %f.at.end, label %convert, label %frac.read
frac.read:
  %fc.ptr = getelementptr i8, ptr %p, i64 %f.pos
  %fc = load i8, ptr %fc.ptr
  %is.dot = icmp eq i8 %fc, 46
  br i1 %is.dot, label %frac.digits, label %convert
frac.digits:
  %fd.start = add i64 %f.pos, 1
  store i64 %fd.start, ptr %pos.addr
  %fd.pos = load i64, ptr %pos.addr
  %fd.at.end = icmp uge i64 %fd.pos, %len
  br i1 %fd.at.end, label %error, label %frac.first
frac.first:
  %ff.ptr = getelementptr i8, ptr %p, i64 %fd.pos
  %ff = load i8, ptr %ff.ptr
  %ff.lo = icmp uge i8 %ff, 48
  %ff.hi = icmp ule i8 %ff, 57
  %is.ff = and i1 %ff.lo, %ff.hi
  br i1 %is.ff, label %frac.loop, label %error
frac.loop:
  %fl.pos = load i64, ptr %pos.addr
  %fl.at.end = icmp uge i64 %fl.pos, %len
  br i1 %fl.at.end, label %exp, label %frac.loop.read
frac.loop.read:
  %flc.ptr = getelementptr i8, ptr %p, i64 %fl.pos
  %flc = load i8, ptr %flc.ptr
  %fl.lo = icmp uge i8 %flc, 48
  %fl.hi = icmp ule i8 %flc, 57
  %is.fl = and i1 %fl.lo, %fl.hi
  br i1 %is.fl, label %frac.advance, label %exp
frac.advance:
  %fl.next = add i64 %fl.pos, 1
  store i64 %fl.next, ptr %pos.addr
  br label %frac.loop
exp:
  %e.pos = load i64, ptr %pos.addr
  %e.at.end = icmp uge i64 %e.pos, %len
  br i1 %e.at.end, label %convert, label %exp.read
exp.read:
  %ec.ptr = getelementptr i8, ptr %p, i64 %e.pos
  %ec = load i8, ptr %ec.ptr
  %is.e.lower = icmp eq i8 %ec, 101
  %is.e.upper = icmp eq i8 %ec, 69
  %is.e = or i1 %is.e.lower, %is.e.upper
  br i1 %is.e, label %exp.sign, label %convert
exp.sign:
  %es.pos = add i64 %e.pos, 1
  store i64 %es.pos, ptr %pos.addr
  %es.at.end = icmp uge i64 %es.pos, %len
  br i1 %es.at.end, label %error, label %exp.sign.read
exp.sign.read:
  %esc.ptr = getelementptr i8, ptr %p, i64 %es.pos
  %esc = load i8, ptr %esc.ptr
  %is.plus = icmp eq i8 %esc, 43
  %is.minus.sign = icmp eq i8 %esc, 45
  %is.sign = or i1 %is.plus, %is.minus.sign
  br i1 %is.sign, label %exp.sign.advance, label %exp.digits
exp.sign.advance:
  %esa.pos = add i64 %es.pos, 1
  store i64 %esa.pos, ptr %pos.addr
  br label %exp.digits
exp.digits:
  %ed.pos = load i64, ptr %pos.addr
  %ed.at.end = icmp uge i64 %ed.pos, %len
  br i1 %ed.at.end, label %error, label %exp.first
exp.first:
  %ef.ptr = getelementptr i8, ptr %p, i64 %ed.pos
  %ef = load i8, ptr %ef.ptr
  %ef.lo = icmp uge i8 %ef, 48
  %ef.hi = icmp ule i8 %ef, 57
  %is.ef = and i1 %ef.lo, %ef.hi
  br i1 %is.ef, label %exp.loop, label %error
exp.loop:
  %el.pos = load i64, ptr %pos.addr
  %el.at.end = icmp uge i64 %el.pos, %len
  br i1 %el.at.end, label %convert, label %exp.loop.read
exp.loop.read:
  %elc.ptr = getelementptr i8, ptr %p, i64 %el.pos
  %elc = load i8, ptr %elc.ptr
  %el.lo = icmp uge i8 %elc, 48
  %el.hi = icmp ule i8 %elc, 57
  %is.el = and i1 %el.lo, %el.hi
  br i1 %is.el, label %exp.advance, label %convert
exp.advance:
  %el.next = add i64 %el.pos, 1
  store i64 %el.next, ptr %pos.addr
  br label %exp.loop
convert:
  %end = load i64, ptr %pos.addr
  %token.len = sub i64 %end, %start
  %buf.size = add i64 %token.len, 1
  %buf = call ptr @malloc(i64 %buf.size)
  %src = getelementptr i8, ptr %p, i64 %start
  call ptr @memcpy(ptr %buf, ptr %src, i64 %token.len)
  %nul.slot = getelementptr i8, ptr %buf, i64 %token.len
  store i8 0, ptr %nul.slot
  %number = call double @strtod(ptr %buf, ptr null)
  %boxed = call i64 @valueBoxNumber(double %number)
  %ok.0 = insertvalue { i64, i1 } undef, i64 %boxed, 0
  %ok.1 = insertvalue { i64, i1 } %ok.0, i1 false, 1
  ret { i64, i1 } %ok.1
error:
  %e.0 = insertvalue { i64, i1 } undef, i64 0, 0
  %e.1 = insertvalue { i64, i1 } %e.0, i1 true, 1
  ret { i64, i1 } %e.1
}
@.jsonparse.true = private unnamed_addr constant [5 x i8] c"true\00"
@.jsonparse.false = private unnamed_addr constant [6 x i8] c"false\00"
@.jsonparse.null = private unnamed_addr constant [5 x i8] c"null\00"

define { i64, i1 } @jsonParseValue(ptr %p, i64 %len, ptr %pos.addr) {
entry:
  %pos = load i64, ptr %pos.addr
  %at.end = icmp uge i64 %pos, %len
  br i1 %at.end, label %error, label %dispatch
dispatch:
  %c.ptr = getelementptr i8, ptr %p, i64 %pos
  %c = load i8, ptr %c.ptr
  %is.object = icmp eq i8 %c, 123
  br i1 %is.object, label %object, label %check.array
check.array:
  %is.array = icmp eq i8 %c, 91
  br i1 %is.array, label %array, label %check.string
check.string:
  %is.string = icmp eq i8 %c, 34
  br i1 %is.string, label %string, label %check.true
check.true:
  %is.t = icmp eq i8 %c, 116
  br i1 %is.t, label %true.literal, label %check.false
check.false:
  %is.f = icmp eq i8 %c, 102
  br i1 %is.f, label %false.literal, label %check.null
check.null:
  %is.n = icmp eq i8 %c, 110
  br i1 %is.n, label %null.literal, label %check.number
check.number:
  %is.minus = icmp eq i8 %c, 45
  %is.digit.lo = icmp uge i8 %c, 48
  %is.digit.hi = icmp ule i8 %c, 57
  %is.digit = and i1 %is.digit.lo, %is.digit.hi
  %is.number = or i1 %is.minus, %is.digit
  br i1 %is.number, label %number, label %error
object:
  %object.next = add i64 %pos, 1
  store i64 %object.next, ptr %pos.addr
  %object.r = call { i64, i1 } @jsonParseObject(ptr %p, i64 %len, ptr %pos.addr)
  ret { i64, i1 } %object.r
array:
  %array.next = add i64 %pos, 1
  store i64 %array.next, ptr %pos.addr
  %array.r = call { i64, i1 } @jsonParseArray(ptr %p, i64 %len, ptr %pos.addr)
  ret { i64, i1 } %array.r
string:
  %string.next = add i64 %pos, 1
  store i64 %string.next, ptr %pos.addr
  %string.r = call { ptr, i64, i1 } @jsonParseString(ptr %p, i64 %len, ptr %pos.addr)
  %string.err = extractvalue { ptr, i64, i1 } %string.r, 2
  br i1 %string.err, label %error, label %string.box
string.box:
  %string.ptr = extractvalue { ptr, i64, i1 } %string.r, 0
  %string.len = extractvalue { ptr, i64, i1 } %string.r, 1
  %string.boxed = call i64 @valueBoxString(ptr %string.ptr, i64 %string.len)
  %string.ok.0 = insertvalue { i64, i1 } undef, i64 %string.boxed, 0
  %string.ok.1 = insertvalue { i64, i1 } %string.ok.0, i1 false, 1
  ret { i64, i1 } %string.ok.1
true.literal:
  %true.match = call i1 @jsonMatchLiteral(ptr %p, i64 %len, ptr %pos.addr, ptr @.jsonparse.true, i64 4)
  br i1 %true.match, label %true.ok, label %error
true.ok:
  %true.ok.0 = insertvalue { i64, i1 } undef, i64 9222246136947933186, 0
  %true.ok.1 = insertvalue { i64, i1 } %true.ok.0, i1 false, 1
  ret { i64, i1 } %true.ok.1
false.literal:
  %false.match = call i1 @jsonMatchLiteral(ptr %p, i64 %len, ptr %pos.addr, ptr @.jsonparse.false, i64 5)
  br i1 %false.match, label %false.ok, label %error
false.ok:
  %false.ok.0 = insertvalue { i64, i1 } undef, i64 9222246136947933185, 0
  %false.ok.1 = insertvalue { i64, i1 } %false.ok.0, i1 false, 1
  ret { i64, i1 } %false.ok.1
null.literal:
  %null.match = call i1 @jsonMatchLiteral(ptr %p, i64 %len, ptr %pos.addr, ptr @.jsonparse.null, i64 4)
  br i1 %null.match, label %null.ok, label %error
null.ok:
  %null.ok.0 = insertvalue { i64, i1 } undef, i64 9222246136947933187, 0
  %null.ok.1 = insertvalue { i64, i1 } %null.ok.0, i1 false, 1
  ret { i64, i1 } %null.ok.1
number:
  %number.r = call { i64, i1 } @jsonParseNumber(ptr %p, i64 %len, ptr %pos.addr)
  ret { i64, i1 } %number.r
error:
  %e.0 = insertvalue { i64, i1 } undef, i64 0, 0
  %e.1 = insertvalue { i64, i1 } %e.0, i1 true, 1
  ret { i64, i1 } %e.1
}
define { i64, i1 } @jsonParseObject(ptr %p, i64 %len, ptr %pos.addr) {
entry:
  %object = call ptr @objectNew(i64 4)
  call void @jsonSkipWhitespace(ptr %p, i64 %len, ptr %pos.addr)
  %first.pos = load i64, ptr %pos.addr
  %first.at.end = icmp uge i64 %first.pos, %len
  br i1 %first.at.end, label %error, label %first.read
first.read:
  %first.ptr = getelementptr i8, ptr %p, i64 %first.pos
  %first.c = load i8, ptr %first.ptr
  %first.close = icmp eq i8 %first.c, 125
  br i1 %first.close, label %close.empty, label %loop
close.empty:
  %empty.next = add i64 %first.pos, 1
  store i64 %empty.next, ptr %pos.addr
  br label %finish
loop:
  call void @jsonSkipWhitespace(ptr %p, i64 %len, ptr %pos.addr)
  %pos = load i64, ptr %pos.addr
  %at.end = icmp uge i64 %pos, %len
  br i1 %at.end, label %error, label %read.key
read.key:
  %c.ptr = getelementptr i8, ptr %p, i64 %pos
  %c = load i8, ptr %c.ptr
  %is.quote = icmp eq i8 %c, 34
  br i1 %is.quote, label %key, label %error
key:
  %key.next = add i64 %pos, 1
  store i64 %key.next, ptr %pos.addr
  %key.r = call { ptr, i64, i1 } @jsonParseString(ptr %p, i64 %len, ptr %pos.addr)
  %key.err = extractvalue { ptr, i64, i1 } %key.r, 2
  br i1 %key.err, label %error, label %key.ok
key.ok:
  %key.ptr = extractvalue { ptr, i64, i1 } %key.r, 0
  %key.len = extractvalue { ptr, i64, i1 } %key.r, 1
  call void @jsonSkipWhitespace(ptr %p, i64 %len, ptr %pos.addr)
  %colon.pos = load i64, ptr %pos.addr
  %colon.at.end = icmp uge i64 %colon.pos, %len
  br i1 %colon.at.end, label %error, label %read.colon
read.colon:
  %colon.ptr = getelementptr i8, ptr %p, i64 %colon.pos
  %colon.c = load i8, ptr %colon.ptr
  %is.colon = icmp eq i8 %colon.c, 58
  br i1 %is.colon, label %value, label %error
value:
  %colon.next = add i64 %colon.pos, 1
  store i64 %colon.next, ptr %pos.addr
  call void @jsonSkipWhitespace(ptr %p, i64 %len, ptr %pos.addr)
  %value.r = call { i64, i1 } @jsonParseValue(ptr %p, i64 %len, ptr %pos.addr)
  %value.err = extractvalue { i64, i1 } %value.r, 1
  br i1 %value.err, label %error, label %value.ok
value.ok:
  %value.v = extractvalue { i64, i1 } %value.r, 0
  call void @objectSet(ptr %object, i64 %key.len, ptr %key.ptr, i64 %value.v)
  call void @jsonSkipWhitespace(ptr %p, i64 %len, ptr %pos.addr)
  %sep.pos = load i64, ptr %pos.addr
  %sep.at.end = icmp uge i64 %sep.pos, %len
  br i1 %sep.at.end, label %error, label %read.sep
read.sep:
  %sep.ptr = getelementptr i8, ptr %p, i64 %sep.pos
  %sep.c = load i8, ptr %sep.ptr
  %is.comma = icmp eq i8 %sep.c, 44
  br i1 %is.comma, label %next, label %check.close
check.close:
  %is.close = icmp eq i8 %sep.c, 125
  br i1 %is.close, label %close, label %error
next:
  %comma.next = add i64 %sep.pos, 1
  store i64 %comma.next, ptr %pos.addr
  br label %loop
close:
  %close.next = add i64 %sep.pos, 1
  store i64 %close.next, ptr %pos.addr
  br label %finish
finish:
  %boxed = call i64 @valueBoxObject(ptr %object)
  %ok.0 = insertvalue { i64, i1 } undef, i64 %boxed, 0
  %ok.1 = insertvalue { i64, i1 } %ok.0, i1 false, 1
  ret { i64, i1 } %ok.1
error:
  %e.0 = insertvalue { i64, i1 } undef, i64 0, 0
  %e.1 = insertvalue { i64, i1 } %e.0, i1 true, 1
  ret { i64, i1 } %e.1
}
define { i64, i1 } @jsonParseArray(ptr %p, i64 %len, ptr %pos.addr) {
entry:
  %array = call ptr @arrayNew(i64 0)
  call void @jsonSkipWhitespace(ptr %p, i64 %len, ptr %pos.addr)
  %first.pos = load i64, ptr %pos.addr
  %first.at.end = icmp uge i64 %first.pos, %len
  br i1 %first.at.end, label %error, label %first.read
first.read:
  %first.ptr = getelementptr i8, ptr %p, i64 %first.pos
  %first.c = load i8, ptr %first.ptr
  %first.close = icmp eq i8 %first.c, 93
  br i1 %first.close, label %close.empty, label %loop
close.empty:
  %empty.next = add i64 %first.pos, 1
  store i64 %empty.next, ptr %pos.addr
  br label %finish
loop:
  call void @jsonSkipWhitespace(ptr %p, i64 %len, ptr %pos.addr)
  %value.r = call { i64, i1 } @jsonParseValue(ptr %p, i64 %len, ptr %pos.addr)
  %value.err = extractvalue { i64, i1 } %value.r, 1
  br i1 %value.err, label %error, label %value.ok
value.ok:
  %value.v = extractvalue { i64, i1 } %value.r, 0
  %pushed = call i64 @arrayPush(ptr %array, i64 %value.v)
  call void @jsonSkipWhitespace(ptr %p, i64 %len, ptr %pos.addr)
  %sep.pos = load i64, ptr %pos.addr
  %sep.at.end = icmp uge i64 %sep.pos, %len
  br i1 %sep.at.end, label %error, label %read.sep
read.sep:
  %sep.ptr = getelementptr i8, ptr %p, i64 %sep.pos
  %sep.c = load i8, ptr %sep.ptr
  %is.comma = icmp eq i8 %sep.c, 44
  br i1 %is.comma, label %next, label %check.close
check.close:
  %is.close = icmp eq i8 %sep.c, 93
  br i1 %is.close, label %close, label %error
next:
  %comma.next = add i64 %sep.pos, 1
  store i64 %comma.next, ptr %pos.addr
  br label %loop
close:
  %close.next = add i64 %sep.pos, 1
  store i64 %close.next, ptr %pos.addr
  br label %finish
finish:
  %boxed = call i64 @valueBoxArray(ptr %array)
  %ok.0 = insertvalue { i64, i1 } undef, i64 %boxed, 0
  %ok.1 = insertvalue { i64, i1 } %ok.0, i1 false, 1
  ret { i64, i1 } %ok.1
error:
  %e.0 = insertvalue { i64, i1 } undef, i64 0, 0
  %e.1 = insertvalue { i64, i1 } %e.0, i1 true, 1
  ret { i64, i1 } %e.1
}
define { i64, i1 } @jsonReviverWalk(i64 %reviver, i64 %holder, i64 %key.value, i64 %index) {
entry:
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %reviver)
  call void @gcRootPush(i64 %holder)
  call void @gcRootPush(i64 %key.value)
  %use.index = icmp sge i64 %index, 0
  br i1 %use.index, label %index.get, label %name.get
index.get:
  %holder.array = call ptr @valueArrayPtr(i64 %holder)
  %index.value = call i64 @arrayGet(ptr %holder.array, i64 %index)
  br label %got
name.get:
  %holder.object = call ptr @valueObjectPtr(i64 %holder)
  %name.ptr = call ptr @valueStringPtr(i64 %key.value)
  %name.len = call i64 @valueStringLength(i64 %key.value)
  %name.value = call i64 @objectGet(ptr %holder.object, i64 %name.len, ptr %name.ptr)
  br label %got
got:
  %value = phi i64 [ %index.value, %index.get ], [ %name.value, %name.get ]
  call void @gcRootPush(i64 %value)
  %is.array = call i1 @valueIsArray(i64 %value)
  br i1 %is.array, label %walk.array, label %check.object
check.object:
  %is.object = call i1 @valueIsObject(i64 %value)
  br i1 %is.object, label %walk.object, label %call.reviver
walk.array:
  %array = call ptr @valueArrayPtr(i64 %value)
  %array.len = call i64 @arrayLength(ptr %array)
  %i.addr = alloca i64
  store i64 0, ptr %i.addr
  br label %array.cond
array.cond:
  %i = load i64, ptr %i.addr
  %array.done = icmp uge i64 %i, %array.len
  br i1 %array.done, label %call.reviver, label %array.body
array.body:
  %sub.key.ptr = call ptr @indexToString(i64 %i)
  %sub.key.len = call i64 @strlen(ptr %sub.key.ptr)
  %sub.key = call i64 @valueBoxString(ptr %sub.key.ptr, i64 %sub.key.len)
  call void @gcRootPush(i64 %sub.key)
  %sub = call { i64, i1 } @jsonReviverWalk(i64 %reviver, i64 %value, i64 %sub.key, i64 %i)
  %sub.value = extractvalue { i64, i1 } %sub, 0
  %sub.error = extractvalue { i64, i1 } %sub, 1
  call void @gcRootPush(i64 %sub.value)
  br i1 %sub.error, label %fail, label %array.replace
array.replace:
  %sub.undef = icmp eq i64 %sub.value, 9222246136947933184
  br i1 %sub.undef, label %array.delete, label %array.set
array.delete:
  call void @arrayDelete(ptr %array, i64 %i)
  br label %array.next
array.set:
  call void @arraySet(ptr %array, i64 %i, i64 %sub.value)
  br label %array.next
array.next:
  %i.next = add i64 %i, 1
  store i64 %i.next, ptr %i.addr
  br label %array.cond
walk.object:
  %object = call ptr @valueObjectPtr(i64 %value)
  %count = load i64, ptr %object
  %entries.slot = getelementptr i8, ptr %object, i64 16
  %entries = load ptr, ptr %entries.slot
  %snap.bytes = mul i64 %count, 16
  %snap = call ptr @malloc(i64 %snap.bytes)
  %j.addr = alloca i64
  store i64 0, ptr %j.addr
  %snap.len.addr = alloca i64
  store i64 0, ptr %snap.len.addr
  br label %snap.cond
snap.cond:
  %j = load i64, ptr %j.addr
  %snap.done = icmp uge i64 %j, %count
  br i1 %snap.done, label %walk.keys, label %snap.body
snap.body:
  %entry.bytes = mul i64 %j, 32
  %entry.ptr = getelementptr i8, ptr %entries, i64 %entry.bytes
  %entry.key.len = load i64, ptr %entry.ptr
  %entry.active = icmp sge i64 %entry.key.len, 0
  br i1 %entry.active, label %snap.store, label %snap.advance
snap.store:
  %entry.key.slot = getelementptr i8, ptr %entry.ptr, i64 8
  %entry.key.ptr = load ptr, ptr %entry.key.slot
  %snap.len = load i64, ptr %snap.len.addr
  %slot.bytes = mul i64 %snap.len, 16
  %slot = getelementptr i8, ptr %snap, i64 %slot.bytes
  store i64 %entry.key.len, ptr %slot
  %slot.key = getelementptr i8, ptr %slot, i64 8
  store ptr %entry.key.ptr, ptr %slot.key
  %snap.len.next = add i64 %snap.len, 1
  store i64 %snap.len.next, ptr %snap.len.addr
  br label %snap.advance
snap.advance:
  %j.next = add i64 %j, 1
  store i64 %j.next, ptr %j.addr
  br label %snap.cond
walk.keys:
  %key.count = load i64, ptr %snap.len.addr
  %w.addr = alloca i64
  store i64 0, ptr %w.addr
  br label %object.cond
object.cond:
  %w = load i64, ptr %w.addr
  %object.done = icmp uge i64 %w, %key.count
  br i1 %object.done, label %call.reviver, label %object.body
object.body:
  %w.bytes = mul i64 %w, 16
  %w.slot = getelementptr i8, ptr %snap, i64 %w.bytes
  %w.key.len = load i64, ptr %w.slot
  %w.key.slot = getelementptr i8, ptr %w.slot, i64 8
  %w.key.ptr = load ptr, ptr %w.key.slot
  %w.key = call i64 @valueBoxString(ptr %w.key.ptr, i64 %w.key.len)
  call void @gcRootPush(i64 %w.key)
  %w.sub = call { i64, i1 } @jsonReviverWalk(i64 %reviver, i64 %value, i64 %w.key, i64 -1)
  %w.sub.value = extractvalue { i64, i1 } %w.sub, 0
  %w.sub.error = extractvalue { i64, i1 } %w.sub, 1
  call void @gcRootPush(i64 %w.sub.value)
  br i1 %w.sub.error, label %fail, label %object.replace
object.replace:
  %w.sub.undef = icmp eq i64 %w.sub.value, 9222246136947933184
  br i1 %w.sub.undef, label %object.delete, label %object.set
object.delete:
  call void @objectDelete(ptr %object, i64 %w.key.len, ptr %w.key.ptr)
  br label %object.next
object.set:
  call void @objectSet(ptr %object, i64 %w.key.len, ptr %w.key.ptr, i64 %w.sub.value)
  br label %object.next
object.next:
  %w.next = add i64 %w, 1
  store i64 %w.next, ptr %w.addr
  br label %object.cond
call.reviver:
  %argv = alloca i64, i64 2
  %arg0 = getelementptr i64, ptr %argv, i64 0
  store i64 %key.value, ptr %arg0
  %arg1 = getelementptr i64, ptr %argv, i64 1
  store i64 %value, ptr %arg1
  %call = call { i64, i1 } @jsCall(i64 %reviver, i64 2, ptr %argv, i64 %holder)
  %call.value = extractvalue { i64, i1 } %call, 0
  %call.error = extractvalue { i64, i1 } %call, 1
  call void @gcRootRestore(i64 %frame)
  %r.0 = insertvalue { i64, i1 } undef, i64 %call.value, 0
  %r.1 = insertvalue { i64, i1 } %r.0, i1 %call.error, 1
  ret { i64, i1 } %r.1
fail:
  %fail.value = phi i64 [ %sub.value, %array.body ], [ %w.sub.value, %object.body ]
  call void @gcRootRestore(i64 %frame)
  %f.0 = insertvalue { i64, i1 } undef, i64 %fail.value, 0
  %f.1 = insertvalue { i64, i1 } %f.0, i1 true, 1
  ret { i64, i1 } %f.1
}
@.jsonparse.error.name = private unnamed_addr constant [12 x i8] c"SyntaxError\00"
@.jsonparse.error.message = private unnamed_addr constant [25 x i8] c"Unexpected token in JSON\00"
@.jsonparse.root.key = private unnamed_addr constant [1 x i8] c"\00"

define { i64, i1 } @jsonParse(i64 %text, i64 %reviver) {
entry:
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %text)
  call void @gcRootPush(i64 %reviver)
  %ptr = call ptr @valueStringPtr(i64 %text)
  %len = call i64 @valueStringLength(i64 %text)
  %pos.addr = alloca i64
  store i64 0, ptr %pos.addr
  call void @jsonSkipWhitespace(ptr %ptr, i64 %len, ptr %pos.addr)
  %r = call { i64, i1 } @jsonParseValue(ptr %ptr, i64 %len, ptr %pos.addr)
  %r.value = extractvalue { i64, i1 } %r, 0
  %r.error = extractvalue { i64, i1 } %r, 1
  call void @gcRootPush(i64 %r.value)
  br i1 %r.error, label %syntax.error, label %check.trailing
check.trailing:
  call void @jsonSkipWhitespace(ptr %ptr, i64 %len, ptr %pos.addr)
  %final.pos = load i64, ptr %pos.addr
  %at.end = icmp eq i64 %final.pos, %len
  br i1 %at.end, label %check.reviver, label %syntax.error
check.reviver:
  %has.reviver = icmp ne i64 %reviver, 9222246136947933184
  br i1 %has.reviver, label %revive, label %done
done:
  call void @gcRootRestore(i64 %frame)
  %d.0 = insertvalue { i64, i1 } undef, i64 %r.value, 0
  %d.1 = insertvalue { i64, i1 } %d.0, i1 false, 1
  ret { i64, i1 } %d.1
revive:
  %holder = call ptr @objectNew(i64 1)
  call void @objectSet(ptr %holder, i64 0, ptr @.jsonparse.root.key, i64 %r.value)
  %holder.boxed = call i64 @valueBoxObject(ptr %holder)
  call void @gcRootPush(i64 %holder.boxed)
  %root.key = call i64 @valueBoxString(ptr @.jsonparse.root.key, i64 0)
  %walk = call { i64, i1 } @jsonReviverWalk(i64 %reviver, i64 %holder.boxed, i64 %root.key, i64 -1)
  %walk.value = extractvalue { i64, i1 } %walk, 0
  %walk.error = extractvalue { i64, i1 } %walk, 1
  call void @gcRootRestore(i64 %frame)
  %w.0 = insertvalue { i64, i1 } undef, i64 %walk.value, 0
  %w.1 = insertvalue { i64, i1 } %w.0, i1 %walk.error, 1
  ret { i64, i1 } %w.1
syntax.error:
  %message = call i64 @valueBoxString(ptr @.jsonparse.error.message, i64 24)
  %error = call ptr @errorNew(i64 6, i64 11, ptr @.jsonparse.error.name, i64 %message)
  %error.value = call i64 @valueBoxObject(ptr %error)
  call void @gcRootRestore(i64 %frame)
  %e.0 = insertvalue { i64, i1 } undef, i64 %error.value, 0
  %e.1 = insertvalue { i64, i1 } %e.0, i1 true, 1
  ret { i64, i1 } %e.1
}
