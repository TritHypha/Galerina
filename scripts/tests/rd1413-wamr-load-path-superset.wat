(module
  (import "galerina:secrets-vault/secrets-gateway@0.1.0"
          "[method]secret-lease.state"
          (func (param i32) (result i32)))
  (import "env" "evil" (func (param i32)))
)
