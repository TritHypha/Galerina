# 084 — Unknown type

**Concept:** Unknown type name produces SPORE-TYPE-001

Using an undeclared or unimported type name is a compile error. The compiler cannot proceed without knowing the type's layout and constraints.

**AI rule:** All types must be declared or imported. Unknown type names are compile errors.
