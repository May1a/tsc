# Store Strings as UTF-8 with UTF-16 Observable Semantics

The runtime may store strings internally as UTF-8, but all JavaScript-visible string behavior must observe UTF-16 code-unit semantics. This supports native and platform interop while preserving JavaScript behavior for `length`, indexing, slicing, and code-unit APIs.
