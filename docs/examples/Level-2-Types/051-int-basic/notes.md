# 051 — Int basic

**Concept:** Int type

Int is the standard integer type. Assign a whole-number literal directly.

**AI rule:** Int is the standard integer type in Galerina.

**Width (MEM-R30, 2026-10-31):** Int is an alias of Int32. It is a checked signed 32-bit integer
(-2147483648 to 2147483647, GIR type id 1), and Int and Int32 are the same type. For 64-bit values
use Int64 (-2^63 to 2^63-1) or UInt64 (0 to 2^64-1); the CLI carries them exactly as bigint. An
Int64 value is never narrowed into Int silently: the checker refuses it (FUNGI-TYPE-008).
Pinned by packages/fungi/memory/tests/mr30-int-width-k3.
