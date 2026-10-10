(module
  (import "host" "operation_context" (memory 1))
  (func (export "read_imported_memory") (result i32)
    (i32.load (i32.const 0))
  )
)
