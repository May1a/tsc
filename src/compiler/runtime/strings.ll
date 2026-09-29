define ptr @strConcat(i64 %left.len, ptr %left.ptr, i64 %right.len, ptr %right.ptr) {
entry:
  %total = add i64 %left.len, %right.len
  %alloc.size = add i64 %total, 1
  %out = call ptr @malloc(i64 %alloc.size)
  call ptr @memcpy(ptr %out, ptr %left.ptr, i64 %left.len)
  %right.dst = getelementptr i8, ptr %out, i64 %left.len
  call ptr @memcpy(ptr %right.dst, ptr %right.ptr, i64 %right.len)
  %nul.ptr = getelementptr i8, ptr %out, i64 %total
  store i8 0, ptr %nul.ptr
  ret ptr %out
}
define i1 @strEquals(i64 %left.len, ptr %left.ptr, i64 %right.len, ptr %right.ptr) {
entry:
  %same.len = icmp eq i64 %left.len, %right.len
  br i1 %same.len, label %compare, label %not.equal
compare:
  %cmp = call i32 @memcmp(ptr %left.ptr, ptr %right.ptr, i64 %left.len)
  %same.bytes = icmp eq i32 %cmp, 0
  br i1 %same.bytes, label %equal, label %not.equal
equal:
  ret i1 true
not.equal:
  ret i1 false
}
define i1 @stringIncludes(i64 %hay.len, ptr %hay.ptr, i64 %needle.len, ptr %needle.ptr) {
entry:
  %empty = icmp eq i64 %needle.len, 0
  br i1 %empty, label %true, label %loop
loop:
  %i = phi i64 [ 0, %entry ], [ %next, %continue ]
  %remaining = sub i64 %hay.len, %i
  %enough = icmp uge i64 %remaining, %needle.len
  br i1 %enough, label %compare, label %false
compare:
  %ptr = getelementptr i8, ptr %hay.ptr, i64 %i
  %cmp = call i32 @memcmp(ptr %ptr, ptr %needle.ptr, i64 %needle.len)
  %same = icmp eq i32 %cmp, 0
  br i1 %same, label %true, label %continue
continue:
  %next = add i64 %i, 1
  br label %loop
true:
  ret i1 true
false:
  ret i1 false
}
define i1 @stringStartsWith(i64 %value.len, ptr %value.ptr, i64 %search.len, ptr %search.ptr) {
entry:
  %enough = icmp uge i64 %value.len, %search.len
  br i1 %enough, label %compare, label %false
compare:
  %cmp = call i32 @memcmp(ptr %value.ptr, ptr %search.ptr, i64 %search.len)
  %same = icmp eq i32 %cmp, 0
  ret i1 %same
false:
  ret i1 false
}
define i1 @stringStartsWithAt(i64 %value.len, ptr %value.ptr, i64 %search.len, ptr %search.ptr, i64 %position) {
entry:
  %remaining = sub i64 %value.len, %position
  %enough = icmp uge i64 %remaining, %search.len
  br i1 %enough, label %compare, label %false
compare:
  %start = getelementptr i8, ptr %value.ptr, i64 %position
  %cmp = call i32 @memcmp(ptr %start, ptr %search.ptr, i64 %search.len)
  %same = icmp eq i32 %cmp, 0
  ret i1 %same
false:
  ret i1 false
}
define i1 @stringEndsWith(i64 %value.len, ptr %value.ptr, i64 %search.len, ptr %search.ptr) {
entry:
  %enough = icmp uge i64 %value.len, %search.len
  br i1 %enough, label %compare, label %false
compare:
  %offset = sub i64 %value.len, %search.len
  %ptr = getelementptr i8, ptr %value.ptr, i64 %offset
  %cmp = call i32 @memcmp(ptr %ptr, ptr %search.ptr, i64 %search.len)
  %same = icmp eq i32 %cmp, 0
  ret i1 %same
false:
  ret i1 false
}
define { ptr, i64 } @stringAt(i64 %value.len, ptr %value.ptr, i64 %position) {
entry:
  %neg = icmp slt i64 %position, 0
  br i1 %neg, label %negative, label %positive
negative:
  %adjusted = add i64 %position, %value.len
  br label %check
positive:
  br label %check
check:
  %index = phi i64 [ %adjusted, %negative ], [ %position, %positive ]
  %in.range = icmp ult i64 %index, %value.len
  br i1 %in.range, label %hit, label %miss
hit:
  %char.ptr = getelementptr i8, ptr %value.ptr, i64 %index
  %out = call ptr @malloc(i64 2)
  %byte = load i8, ptr %char.ptr
  store i8 %byte, ptr %out
  %nul = getelementptr i8, ptr %out, i64 1
  store i8 0, ptr %nul
  %r0 = insertvalue { ptr, i64 } undef, ptr %out, 0
  %r1 = insertvalue { ptr, i64 } %r0, i64 1, 1
  ret { ptr, i64 } %r1
miss:
  ret { ptr, i64 } { ptr null, i64 0 }
}
define { ptr, i64 } @stringNormalize(i64 %value.len, ptr %value.ptr) {
entry:
  %out = call ptr @malloc(i64 %value.len)
  call ptr @memcpy(ptr %out, ptr %value.ptr, i64 %value.len)
  %r0 = insertvalue { ptr, i64 } undef, ptr %out, 0
  %r1 = insertvalue { ptr, i64 } %r0, i64 %value.len, 1
  ret { ptr, i64 } %r1
}
define double @stringCharCodeAt(i64 %value.len, ptr %value.ptr, i64 %index) {
entry:
  %neg = icmp slt i64 %index, 0
  br i1 %neg, label %negative, label %positive
negative:
  %adjusted = add i64 %index, %value.len
  br label %check
positive:
  br label %check
check:
  %real = phi i64 [ %adjusted, %negative ], [ %index, %positive ]
  %in.range = icmp ult i64 %real, %value.len
  br i1 %in.range, label %hit, label %miss
hit:
  %byte.ptr = getelementptr i8, ptr %value.ptr, i64 %real
  %byte = load i8, ptr %byte.ptr
  %code = zext i8 %byte to i64
  %as.double = sitofp i64 %code to double
  ret double %as.double
miss:
  ret double 0x7FF8000000000000
}
define { ptr, i64 } @stringCharAt(i64 %value.len, ptr %value.ptr, i64 %index) {
entry:
  %in.range = icmp ult i64 %index, %value.len
  br i1 %in.range, label %hit, label %miss
hit:
  %result = call { ptr, i64 } @stringSliceCopy(ptr %value.ptr, i64 %index, i64 1)
  ret { ptr, i64 } %result
miss:
  %empty = call { ptr, i64 } @stringSliceCopy(ptr %value.ptr, i64 0, i64 0)
  ret { ptr, i64 } %empty
}
define { ptr, i64 } @stringSlice(i64 %value.len, ptr %value.ptr, i64 %start, i64 %end) {
entry:
  %start.neg = icmp slt i64 %start, 0
  %start.adjusted = add i64 %start, %value.len
  %start.candidate = select i1 %start.neg, i64 %start.adjusted, i64 %start
  %start.below = icmp slt i64 %start.candidate, 0
  %start.low = select i1 %start.below, i64 0, i64 %start.candidate
  %start.above = icmp sgt i64 %start.low, %value.len
  %from = select i1 %start.above, i64 %value.len, i64 %start.low
  %end.neg = icmp slt i64 %end, 0
  %end.adjusted = add i64 %end, %value.len
  %end.candidate = select i1 %end.neg, i64 %end.adjusted, i64 %end
  %end.below = icmp slt i64 %end.candidate, 0
  %end.low = select i1 %end.below, i64 0, i64 %end.candidate
  %end.above = icmp sgt i64 %end.low, %value.len
  %to = select i1 %end.above, i64 %value.len, i64 %end.low
  %raw.len = sub i64 %to, %from
  %len.neg = icmp slt i64 %raw.len, 0
  %len = select i1 %len.neg, i64 0, i64 %raw.len
  %result = call { ptr, i64 } @stringSliceCopy(ptr %value.ptr, i64 %from, i64 %len)
  ret { ptr, i64 } %result
}
define { ptr, i64 } @stringSubstring(i64 %value.len, ptr %value.ptr, i64 %start, i64 %end) {
entry:
  %start.neg = icmp slt i64 %start, 0
  %start.low = select i1 %start.neg, i64 0, i64 %start
  %start.above = icmp sgt i64 %start.low, %value.len
  %a = select i1 %start.above, i64 %value.len, i64 %start.low
  %end.neg = icmp slt i64 %end, 0
  %end.low = select i1 %end.neg, i64 0, i64 %end
  %end.above = icmp sgt i64 %end.low, %value.len
  %b = select i1 %end.above, i64 %value.len, i64 %end.low
  %swap = icmp sgt i64 %a, %b
  %from = select i1 %swap, i64 %b, i64 %a
  %to = select i1 %swap, i64 %a, i64 %b
  %len = sub i64 %to, %from
  %result = call { ptr, i64 } @stringSliceCopy(ptr %value.ptr, i64 %from, i64 %len)
  ret { ptr, i64 } %result
}
define { ptr, i64 } @stringSubstr(i64 %value.len, ptr %value.ptr, i64 %start, i64 %length) {
entry:
  %start.neg = icmp slt i64 %start, 0
  %start.adjusted = add i64 %start, %value.len
  %start.candidate = select i1 %start.neg, i64 %start.adjusted, i64 %start
  %start.below = icmp slt i64 %start.candidate, 0
  %start.low = select i1 %start.below, i64 0, i64 %start.candidate
  %start.above = icmp sgt i64 %start.low, %value.len
  %from = select i1 %start.above, i64 %value.len, i64 %start.low
  %available = sub i64 %value.len, %from
  %length.neg = icmp slt i64 %length, 0
  %length.low = select i1 %length.neg, i64 0, i64 %length
  %length.above = icmp sgt i64 %length.low, %available
  %len = select i1 %length.above, i64 %available, i64 %length.low
  %result = call { ptr, i64 } @stringSliceCopy(ptr %value.ptr, i64 %from, i64 %len)
  ret { ptr, i64 } %result
}
define { ptr, i64 } @stringFromCharCode(ptr %codes, i64 %count) {
entry:
  %alloc.size = add i64 %count, 1
  %out = call ptr @malloc(i64 %alloc.size)
  br label %loop
loop:
  %i = phi i64 [ 0, %entry ], [ %next, %step ]
  %done = icmp uge i64 %i, %count
  br i1 %done, label %finish, label %step
step:
  %code.ptr = getelementptr i64, ptr %codes, i64 %i
  %code = load i64, ptr %code.ptr
  %byte = trunc i64 %code to i8
  %out.ptr = getelementptr i8, ptr %out, i64 %i
  store i8 %byte, ptr %out.ptr
  %next = add i64 %i, 1
  br label %loop
finish:
  %nul = getelementptr i8, ptr %out, i64 %count
  store i8 0, ptr %nul
  %r0 = insertvalue { ptr, i64 } undef, ptr %out, 0
  %r1 = insertvalue { ptr, i64 } %r0, i64 %count, 1
  ret { ptr, i64 } %r1
}
define double @stringIndexOf(i64 %hay.len, ptr %hay.ptr, i64 %needle.len, ptr %needle.ptr, i64 %from) {
entry:
  %from.neg = icmp slt i64 %from, 0
  %from.low = select i1 %from.neg, i64 0, i64 %from
  %from.above = icmp sgt i64 %from.low, %hay.len
  %start = select i1 %from.above, i64 %hay.len, i64 %from.low
  %empty = icmp eq i64 %needle.len, 0
  br i1 %empty, label %found.start, label %scan
found.start:
  %start.double = sitofp i64 %start to double
  ret double %start.double
scan:
  %last = sub i64 %hay.len, %needle.len
  br label %loop
loop:
  %i = phi i64 [ %start, %scan ], [ %next, %continue ]
  %past = icmp sgt i64 %i, %last
  br i1 %past, label %miss, label %compare
compare:
  %ptr = getelementptr i8, ptr %hay.ptr, i64 %i
  %cmp = call i32 @memcmp(ptr %ptr, ptr %needle.ptr, i64 %needle.len)
  %same = icmp eq i32 %cmp, 0
  br i1 %same, label %hit, label %continue
continue:
  %next = add i64 %i, 1
  br label %loop
hit:
  %as.double = sitofp i64 %i to double
  ret double %as.double
miss:
  ret double -1.0
}
define double @stringLastIndexOf(i64 %hay.len, ptr %hay.ptr, i64 %needle.len, ptr %needle.ptr) {
entry:
  %empty = icmp eq i64 %needle.len, 0
  br i1 %empty, label %found.end, label %scan
found.end:
  %end.double = sitofp i64 %hay.len to double
  ret double %end.double
scan:
  %start = sub i64 %hay.len, %needle.len
  br label %loop
loop:
  %i = phi i64 [ %start, %scan ], [ %next, %continue ]
  %in.range = icmp sge i64 %i, 0
  br i1 %in.range, label %compare, label %miss
compare:
  %ptr = getelementptr i8, ptr %hay.ptr, i64 %i
  %cmp = call i32 @memcmp(ptr %ptr, ptr %needle.ptr, i64 %needle.len)
  %same = icmp eq i32 %cmp, 0
  br i1 %same, label %hit, label %continue
continue:
  %next = sub i64 %i, 1
  br label %loop
hit:
  %as.double = sitofp i64 %i to double
  ret double %as.double
miss:
  ret double -1.0
}
define i1 @stringIsAsciiWhitespace(i8 %byte) {
entry:
  %space = icmp eq i8 %byte, 32
  %tab = icmp eq i8 %byte, 9
  %lf = icmp eq i8 %byte, 10
  %cr = icmp eq i8 %byte, 13
  %a = or i1 %space, %tab
  %b = or i1 %lf, %cr
  %result = or i1 %a, %b
  ret i1 %result
}
define { ptr, i64 } @stringSliceCopy(ptr %value.ptr, i64 %start, i64 %len) {
entry:
  %alloc.size = add i64 %len, 1
  %out = call ptr @malloc(i64 %alloc.size)
  %src = getelementptr i8, ptr %value.ptr, i64 %start
  call ptr @memcpy(ptr %out, ptr %src, i64 %len)
  %nul = getelementptr i8, ptr %out, i64 %len
  store i8 0, ptr %nul
  %r0 = insertvalue { ptr, i64 } undef, ptr %out, 0
  %r1 = insertvalue { ptr, i64 } %r0, i64 %len, 1
  ret { ptr, i64 } %r1
}
define i64 @stringTrimStartIndex(i64 %value.len, ptr %value.ptr) {
entry:
  br label %loop
loop:
  %i = phi i64 [ 0, %entry ], [ %next, %ws ]
  %done = icmp uge i64 %i, %value.len
  br i1 %done, label %end, label %check
check:
  %ptr = getelementptr i8, ptr %value.ptr, i64 %i
  %byte = load i8, ptr %ptr
  %is.ws = call i1 @stringIsAsciiWhitespace(i8 %byte)
  br i1 %is.ws, label %ws, label %end
ws:
  %next = add i64 %i, 1
  br label %loop
end:
  ret i64 %i
}
define i64 @stringTrimEndIndex(i64 %value.len, ptr %value.ptr) {
entry:
  br label %loop
loop:
  %i = phi i64 [ %value.len, %entry ], [ %prev, %ws ]
  %done = icmp eq i64 %i, 0
  br i1 %done, label %end, label %check
check:
  %prev = sub i64 %i, 1
  %ptr = getelementptr i8, ptr %value.ptr, i64 %prev
  %byte = load i8, ptr %ptr
  %is.ws = call i1 @stringIsAsciiWhitespace(i8 %byte)
  br i1 %is.ws, label %ws, label %end
ws:
  br label %loop
end:
  ret i64 %i
}
define { ptr, i64 } @stringTrim(i64 %value.len, ptr %value.ptr) {
entry:
  %start = call i64 @stringTrimStartIndex(i64 %value.len, ptr %value.ptr)
  %end = call i64 @stringTrimEndIndex(i64 %value.len, ptr %value.ptr)
  %raw.len = sub i64 %end, %start
  %negative = icmp slt i64 %raw.len, 0
  %len = select i1 %negative, i64 0, i64 %raw.len
  %result = call { ptr, i64 } @stringSliceCopy(ptr %value.ptr, i64 %start, i64 %len)
  ret { ptr, i64 } %result
}
define { ptr, i64 } @stringTrimStart(i64 %value.len, ptr %value.ptr) {
entry:
  %start = call i64 @stringTrimStartIndex(i64 %value.len, ptr %value.ptr)
  %len = sub i64 %value.len, %start
  %result = call { ptr, i64 } @stringSliceCopy(ptr %value.ptr, i64 %start, i64 %len)
  ret { ptr, i64 } %result
}
define { ptr, i64 } @stringTrimEnd(i64 %value.len, ptr %value.ptr) {
entry:
  %end = call i64 @stringTrimEndIndex(i64 %value.len, ptr %value.ptr)
  %result = call { ptr, i64 } @stringSliceCopy(ptr %value.ptr, i64 0, i64 %end)
  ret { ptr, i64 } %result
}
define { ptr, i64 } @stringToUpperCase(i64 %value.len, ptr %value.ptr) {
entry:
  %alloc.size = add i64 %value.len, 1
  %out = call ptr @malloc(i64 %alloc.size)
  br label %loop
loop:
  %i = phi i64 [ 0, %entry ], [ %next, %store ]
  %done = icmp eq i64 %i, %value.len
  br i1 %done, label %exit, label %body
body:
  %src = getelementptr i8, ptr %value.ptr, i64 %i
  %byte = load i8, ptr %src
  %ge.a = icmp uge i8 %byte, 97
  %le.z = icmp ule i8 %byte, 122
  %is.lower = and i1 %ge.a, %le.z
  %upper = sub i8 %byte, 32
  %result = select i1 %is.lower, i8 %upper, i8 %byte
  br label %store
store:
  %dst = getelementptr i8, ptr %out, i64 %i
  store i8 %result, ptr %dst
  %next = add i64 %i, 1
  br label %loop
exit:
  %nul = getelementptr i8, ptr %out, i64 %value.len
  store i8 0, ptr %nul
  %r0 = insertvalue { ptr, i64 } undef, ptr %out, 0
  %r1 = insertvalue { ptr, i64 } %r0, i64 %value.len, 1
  ret { ptr, i64 } %r1
}
define { ptr, i64 } @stringToLowerCase(i64 %value.len, ptr %value.ptr) {
entry:
  %alloc.size = add i64 %value.len, 1
  %out = call ptr @malloc(i64 %alloc.size)
  br label %loop
loop:
  %i = phi i64 [ 0, %entry ], [ %next, %store ]
  %done = icmp eq i64 %i, %value.len
  br i1 %done, label %exit, label %body
body:
  %src = getelementptr i8, ptr %value.ptr, i64 %i
  %byte = load i8, ptr %src
  %ge.a = icmp uge i8 %byte, 65
  %le.z = icmp ule i8 %byte, 90
  %is.upper = and i1 %ge.a, %le.z
  %lower = add i8 %byte, 32
  %result = select i1 %is.upper, i8 %lower, i8 %byte
  br label %store
store:
  %dst = getelementptr i8, ptr %out, i64 %i
  store i8 %result, ptr %dst
  %next = add i64 %i, 1
  br label %loop
exit:
  %nul = getelementptr i8, ptr %out, i64 %value.len
  store i8 0, ptr %nul
  %r0 = insertvalue { ptr, i64 } undef, ptr %out, 0
  %r1 = insertvalue { ptr, i64 } %r0, i64 %value.len, 1
  ret { ptr, i64 } %r1
}
define { ptr, i64 } @stringRepeat(i64 %value.len, ptr %value.ptr, i64 %count) {
entry:
  %nonpositive = icmp sle i64 %count, 0
  br i1 %nonpositive, label %empty, label %alloc
empty:
  %empty.out = call ptr @malloc(i64 1)
  store i8 0, ptr %empty.out
  %e0 = insertvalue { ptr, i64 } undef, ptr %empty.out, 0
  %e1 = insertvalue { ptr, i64 } %e0, i64 0, 1
  ret { ptr, i64 } %e1
alloc:
  %total = mul i64 %value.len, %count
  %alloc.size = add i64 %total, 1
  %out = call ptr @malloc(i64 %alloc.size)
  br label %loop
loop:
  %i = phi i64 [ 0, %alloc ], [ %next, %copy ]
  %done = icmp eq i64 %i, %count
  br i1 %done, label %exit, label %copy
copy:
  %offset = mul i64 %i, %value.len
  %dst = getelementptr i8, ptr %out, i64 %offset
  call ptr @memcpy(ptr %dst, ptr %value.ptr, i64 %value.len)
  %next = add i64 %i, 1
  br label %loop
exit:
  %nul = getelementptr i8, ptr %out, i64 %total
  store i8 0, ptr %nul
  %r0 = insertvalue { ptr, i64 } undef, ptr %out, 0
  %r1 = insertvalue { ptr, i64 } %r0, i64 %total, 1
  ret { ptr, i64 } %r1
}
define { ptr, i64 } @stringReplace(i64 %value.len, ptr %value.ptr, i64 %search.len, ptr %search.ptr, i64 %replacement.len, ptr %replacement.ptr) {
entry:
  br label %scan
scan:
  %i = phi i64 [ 0, %entry ], [ %next, %advance ]
  %remaining = sub i64 %value.len, %i
  %enough = icmp uge i64 %remaining, %search.len
  br i1 %enough, label %compare, label %not.found
compare:
  %candidate = getelementptr i8, ptr %value.ptr, i64 %i
  %cmp = call i32 @memcmp(ptr %candidate, ptr %search.ptr, i64 %search.len)
  %same = icmp eq i32 %cmp, 0
  br i1 %same, label %found, label %advance
advance:
  %next = add i64 %i, 1
  br label %scan
not.found:
  %copy.size = add i64 %value.len, 1
  %copy = call ptr @malloc(i64 %copy.size)
  call ptr @memcpy(ptr %copy, ptr %value.ptr, i64 %value.len)
  %copy.nul = getelementptr i8, ptr %copy, i64 %value.len
  store i8 0, ptr %copy.nul
  %n0 = insertvalue { ptr, i64 } undef, ptr %copy, 0
  %n1 = insertvalue { ptr, i64 } %n0, i64 %value.len, 1
  ret { ptr, i64 } %n1
found:
  %without.search = sub i64 %value.len, %search.len
  %out.len = add i64 %without.search, %replacement.len
  %alloc.size = add i64 %out.len, 1
  %out = call ptr @malloc(i64 %alloc.size)
  call ptr @memcpy(ptr %out, ptr %value.ptr, i64 %i)
  %replacement.dst = getelementptr i8, ptr %out, i64 %i
  call ptr @memcpy(ptr %replacement.dst, ptr %replacement.ptr, i64 %replacement.len)
  %suffix.src.offset = add i64 %i, %search.len
  %suffix.src = getelementptr i8, ptr %value.ptr, i64 %suffix.src.offset
  %suffix.dst.offset = add i64 %i, %replacement.len
  %suffix.dst = getelementptr i8, ptr %out, i64 %suffix.dst.offset
  %suffix.len = sub i64 %value.len, %suffix.src.offset
  call ptr @memcpy(ptr %suffix.dst, ptr %suffix.src, i64 %suffix.len)
  %nul = getelementptr i8, ptr %out, i64 %out.len
  store i8 0, ptr %nul
  %r0 = insertvalue { ptr, i64 } undef, ptr %out, 0
  %r1 = insertvalue { ptr, i64 } %r0, i64 %out.len, 1
  ret { ptr, i64 } %r1
}
define { ptr, i64 } @stringReplaceAll(i64 %value.len, ptr %value.ptr, i64 %search.len, ptr %search.ptr, i64 %replacement.len, ptr %replacement.ptr) {
entry:
  %empty.search = icmp eq i64 %search.len, 0
  br i1 %empty.search, label %copy.original, label %count.loop
copy.original:
  %copy.size = add i64 %value.len, 1
  %copy = call ptr @malloc(i64 %copy.size)
  call ptr @memcpy(ptr %copy, ptr %value.ptr, i64 %value.len)
  %copy.nul = getelementptr i8, ptr %copy, i64 %value.len
  store i8 0, ptr %copy.nul
  %c0 = insertvalue { ptr, i64 } undef, ptr %copy, 0
  %c1 = insertvalue { ptr, i64 } %c0, i64 %value.len, 1
  ret { ptr, i64 } %c1
count.loop:
  %ci = phi i64 [ 0, %entry ], [ %ci.next, %count.advance ], [ %ci.after.match, %count.match ]
  %count = phi i64 [ 0, %entry ], [ %count, %count.advance ], [ %count.next, %count.match ]
  %remaining = sub i64 %value.len, %ci
  %enough = icmp uge i64 %remaining, %search.len
  br i1 %enough, label %count.compare, label %alloc
count.compare:
  %candidate = getelementptr i8, ptr %value.ptr, i64 %ci
  %cmp = call i32 @memcmp(ptr %candidate, ptr %search.ptr, i64 %search.len)
  %same = icmp eq i32 %cmp, 0
  br i1 %same, label %count.match, label %count.advance
count.match:
  %count.next = add i64 %count, 1
  %ci.after.match = add i64 %ci, %search.len
  br label %count.loop
count.advance:
  %ci.next = add i64 %ci, 1
  br label %count.loop
alloc:
  %delta = sub i64 %replacement.len, %search.len
  %growth = mul i64 %delta, %count
  %out.len = add i64 %value.len, %growth
  %alloc.size = add i64 %out.len, 1
  %out = call ptr @malloc(i64 %alloc.size)
  br label %copy.loop
copy.loop:
  %si = phi i64 [ 0, %alloc ], [ %si.next, %copy.char ], [ %si.after.match, %copy.match ]
  %di = phi i64 [ 0, %alloc ], [ %di.next, %copy.char ], [ %di.after.match, %copy.match ]
  %done = icmp eq i64 %si, %value.len
  br i1 %done, label %exit, label %copy.check
copy.check:
  %remaining.copy = sub i64 %value.len, %si
  %enough.copy = icmp uge i64 %remaining.copy, %search.len
  br i1 %enough.copy, label %copy.compare, label %copy.char
copy.compare:
  %candidate.copy = getelementptr i8, ptr %value.ptr, i64 %si
  %cmp.copy = call i32 @memcmp(ptr %candidate.copy, ptr %search.ptr, i64 %search.len)
  %same.copy = icmp eq i32 %cmp.copy, 0
  br i1 %same.copy, label %copy.match, label %copy.char
copy.match:
  %replacement.dst = getelementptr i8, ptr %out, i64 %di
  call ptr @memcpy(ptr %replacement.dst, ptr %replacement.ptr, i64 %replacement.len)
  %si.after.match = add i64 %si, %search.len
  %di.after.match = add i64 %di, %replacement.len
  br label %copy.loop
copy.char:
  %src = getelementptr i8, ptr %value.ptr, i64 %si
  %byte = load i8, ptr %src
  %dst = getelementptr i8, ptr %out, i64 %di
  store i8 %byte, ptr %dst
  %si.next = add i64 %si, 1
  %di.next = add i64 %di, 1
  br label %copy.loop
exit:
  %nul = getelementptr i8, ptr %out, i64 %out.len
  store i8 0, ptr %nul
  %r0 = insertvalue { ptr, i64 } undef, ptr %out, 0
  %r1 = insertvalue { ptr, i64 } %r0, i64 %out.len, 1
  ret { ptr, i64 } %r1
}
define { ptr, i64 } @stringPad(i64 %value.len, ptr %value.ptr, i64 %target.len, i64 %pad.len, ptr %pad.ptr, i1 %at.start) {
entry:
  %needs.pad = icmp sgt i64 %target.len, %value.len
  %empty.pad = icmp eq i64 %pad.len, 0
  %not.needs.pad = xor i1 %needs.pad, true
  %skip.pad = or i1 %not.needs.pad, %empty.pad
  br i1 %skip.pad, label %copy.original, label %alloc
copy.original:
  %copy.size = add i64 %value.len, 1
  %copy = call ptr @malloc(i64 %copy.size)
  call ptr @memcpy(ptr %copy, ptr %value.ptr, i64 %value.len)
  %copy.nul = getelementptr i8, ptr %copy, i64 %value.len
  store i8 0, ptr %copy.nul
  %c0 = insertvalue { ptr, i64 } undef, ptr %copy, 0
  %c1 = insertvalue { ptr, i64 } %c0, i64 %value.len, 1
  ret { ptr, i64 } %c1
alloc:
  %needed = sub i64 %target.len, %value.len
  %alloc.size = add i64 %target.len, 1
  %out = call ptr @malloc(i64 %alloc.size)
  br i1 %at.start, label %pad.first, label %value.first
pad.first:
  br label %pad.loop
value.first:
  call ptr @memcpy(ptr %out, ptr %value.ptr, i64 %value.len)
  br label %pad.loop
pad.loop:
  %i = phi i64 [ 0, %pad.first ], [ 0, %value.first ], [ %next, %pad.store ]
  %done = icmp eq i64 %i, %needed
  br i1 %done, label %after.pad, label %pad.store
pad.store:
  %pad.index = urem i64 %i, %pad.len
  %pad.src = getelementptr i8, ptr %pad.ptr, i64 %pad.index
  %byte = load i8, ptr %pad.src
  %end.dst = add i64 %value.len, %i
  %dst.index = select i1 %at.start, i64 %i, i64 %end.dst
  %dst = getelementptr i8, ptr %out, i64 %dst.index
  store i8 %byte, ptr %dst
  %next = add i64 %i, 1
  br label %pad.loop
after.pad:
  br i1 %at.start, label %copy.value.after, label %finish
copy.value.after:
  %value.dst = getelementptr i8, ptr %out, i64 %needed
  call ptr @memcpy(ptr %value.dst, ptr %value.ptr, i64 %value.len)
  br label %finish
finish:
  %nul = getelementptr i8, ptr %out, i64 %target.len
  store i8 0, ptr %nul
  %r0 = insertvalue { ptr, i64 } undef, ptr %out, 0
  %r1 = insertvalue { ptr, i64 } %r0, i64 %target.len, 1
  ret { ptr, i64 } %r1
}
define { ptr, i64 } @stringPadStart(i64 %value.len, ptr %value.ptr, i64 %target.len, i64 %pad.len, ptr %pad.ptr) {
entry:
  %result = call { ptr, i64 } @stringPad(i64 %value.len, ptr %value.ptr, i64 %target.len, i64 %pad.len, ptr %pad.ptr, i1 true)
  ret { ptr, i64 } %result
}
define { ptr, i64 } @stringPadEnd(i64 %value.len, ptr %value.ptr, i64 %target.len, i64 %pad.len, ptr %pad.ptr) {
entry:
  %result = call { ptr, i64 } @stringPad(i64 %value.len, ptr %value.ptr, i64 %target.len, i64 %pad.len, ptr %pad.ptr, i1 false)
  ret { ptr, i64 } %result
}
define ptr @stringSplit(i64 %value.len, ptr %value.ptr, i64 %separator.len, ptr %separator.ptr, i64 %limit) {
entry:
  %zero.limit = icmp eq i64 %limit, 0
  br i1 %zero.limit, label %empty.result, label %dispatch
empty.result:
  %empty = call ptr @arrayNew(i64 0)
  ret ptr %empty
dispatch:
  %empty.separator = icmp eq i64 %separator.len, 0
  br i1 %empty.separator, label %split.chars, label %split.separator
split.chars:
  %unlimited.chars = icmp slt i64 %limit, 0
  %len.lt.limit = icmp slt i64 %value.len, %limit
  %limit.bound = select i1 %len.lt.limit, i64 %value.len, i64 %limit
  %char.count = select i1 %unlimited.chars, i64 %value.len, i64 %limit.bound
  %char.array = call ptr @arrayNew(i64 0)
  br label %char.loop
char.loop:
  %char.i = phi i64 [ 0, %split.chars ], [ %char.next, %char.body ]
  %char.done = icmp eq i64 %char.i, %char.count
  br i1 %char.done, label %char.exit, label %char.body
char.body:
  %char.copy = call ptr @malloc(i64 2)
  %char.src = getelementptr i8, ptr %value.ptr, i64 %char.i
  %char.byte = load i8, ptr %char.src
  store i8 %char.byte, ptr %char.copy
  %char.nul = getelementptr i8, ptr %char.copy, i64 1
  store i8 0, ptr %char.nul
  %char.boxed = call i64 @valueBoxString(ptr %char.copy, i64 1)
  call void @arraySet(ptr %char.array, i64 %char.i, i64 %char.boxed)
  %char.next = add i64 %char.i, 1
  br label %char.loop
char.exit:
  ret ptr %char.array
split.separator:
  %array = call ptr @arrayNew(i64 0)
  br label %scan
scan:
  %start = phi i64 [ 0, %split.separator ], [ %next.start, %emit ]
  %out.index = phi i64 [ 0, %split.separator ], [ %next.out, %emit ]
  %at.limit = icmp eq i64 %out.index, %limit
  %limited = icmp sge i64 %limit, 0
  %limit.done = and i1 %limited, %at.limit
  br i1 %limit.done, label %exit, label %find
find:
  br label %find.loop
find.loop:
  %i = phi i64 [ %start, %find ], [ %find.next, %find.advance ]
  %remaining = sub i64 %value.len, %i
  %enough = icmp uge i64 %remaining, %separator.len
  br i1 %enough, label %find.compare, label %emit.end
find.compare:
  %candidate = getelementptr i8, ptr %value.ptr, i64 %i
  %cmp = call i32 @memcmp(ptr %candidate, ptr %separator.ptr, i64 %separator.len)
  %same = icmp eq i32 %cmp, 0
  br i1 %same, label %emit.match, label %find.advance
find.advance:
  %find.next = add i64 %i, 1
  br label %find.loop
emit.match:
  br label %emit
emit.end:
  br label %emit
emit:
  %end = phi i64 [ %i, %emit.match ], [ %value.len, %emit.end ]
  %is.end = phi i1 [ false, %emit.match ], [ true, %emit.end ]
  %part.len = sub i64 %end, %start
  %part.size = add i64 %part.len, 1
  %part.ptr = call ptr @malloc(i64 %part.size)
  %part.src = getelementptr i8, ptr %value.ptr, i64 %start
  call ptr @memcpy(ptr %part.ptr, ptr %part.src, i64 %part.len)
  %part.nul = getelementptr i8, ptr %part.ptr, i64 %part.len
  store i8 0, ptr %part.nul
  %boxed = call i64 @valueBoxString(ptr %part.ptr, i64 %part.len)
  call void @arraySet(ptr %array, i64 %out.index, i64 %boxed)
  %next.out = add i64 %out.index, 1
  %next.start = add i64 %end, %separator.len
  br i1 %is.end, label %exit, label %scan
exit:
  ret ptr %array
}
