(module
  (import "galerina:secrets-vault/secrets-gateway@0.1.0"
          "[method]secret-lease.state"
          (func $state_a (param i32) (result i32)))
  (import "galerina:secrets-vault/secrets-gateway@0.1.0"
          "[method]secret-lease.state"
          (func $state_b (param i32) (result i32)))
)
