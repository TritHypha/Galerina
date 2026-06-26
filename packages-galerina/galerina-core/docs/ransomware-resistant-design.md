# Galerina Ransomware-Resistant Design

This document describes the proposed **Ransomware-Resistant Design** model for **Galerina / Galerina**.

Galerina is a strict, memory-safe, security-first, JSON-native, API-native and accelerator-aware programming language concept.

The goal is not to claim Galerina can stop all ransomware. The goal is to make ransomware-style behaviour harder to write accidentally, harder for dependencies to abuse, easier to detect, and easier to report before deployment.

---

## Summary

Galerina should support ransomware-resistant application design through compiler, runtime and security policy controls.

This includes:

```text
file write restrictions
protected paths
package permissions
shell execution controls
mass file modification detection
mass rename detection
database destructive action controls
backup protection
security audit reports
AI-readable security guidance
```

The core rule is:

```text
Galerina cannot guarantee ransomware prevention.
Galerina can reduce ransomware impact by making dangerous file, network, package and permission behaviour explicit, limited and reportable.
```

---

## Core Principle

```text
Deny dangerous behaviour by default.
Allow only what the app needs.
Report all risky file, database, package and shell actions.
Fail safely before destructive behaviour spreads.
```

---

## Why This Matters

Ransomware-style behaviour often involves:

```text
encrypting many files
renaming many files
deleting backups
modifying documents in bulk
writing ransom files
using shell commands
abusing broad file permissions
abusing package permissions
deleting or corrupting databases
exfiltrating data before encryption
```

Galerina should make these behaviours visible and controllable.

---

## Non-Guarantee

Galerina should be clear:

```text
Ransomware-resistant design does not replace endpoint security.
Ransomware-resistant design does not replace backups.
Ransomware-resistant design does not replace cloud security groups.
Ransomware-resistant design does not replace operating-system permissions.
Ransomware-resistant design does not replace professional security testing.
```

Galerina helps reduce risk inside Galerina applications and their dependencies.

---

# 1. File Access Policy

Galerina should deny broad file access by default.

Recommended location:

```text
boot.spore
```

Example:

```Galerina
security {
  file_access {
    default "deny"

    allow_read [
      "./data/input",
      "./public/uploads"
    ]

    allow_write [
      "./storage/app",
      "./storage/tmp"
    ]

    deny_write [
      "./src",
      "./compiler",
      "./schemas",
      "./backups",
      "./.env",
      "./vendor",
      "./node_modules"
    ]

    recursive_write "deny_by_default"
  }
}
```

---

## File Access Rule

```text
A Galerina application may only read or write paths explicitly allowed by policy.
```

This prevents broad access such as:

```text
write anywhere
delete anywhere
rename anything
modify source files
modify dependency folders
modify backup folders
```

---

## Protected Paths

Protected paths should not be writable by normal application flows.

Recommended protected paths:

```text
./src
./compiler
./schemas
./grammar
./docs
./backups
./.env
./vendor
./node_modules
./build/release
```

Example:

```Galerina
security {
  protected_paths [
    "./src",
    "./backups",
    "./.env",
    "./vendor"
  ]
}
```

---

## File Write Error Example

If code tries:

```Galerina
file.write("./src/main.spore", data)
```

but `./src` is protected, Galerina should report:

```text
Security policy error:
Write denied to protected path.

Path:
  ./src/main.spore

Flow:
  updateSourceFile

Source:
  src/admin/update-source.spore:18

Reason:
  ./src is protected by boot.spore.
```

---

# 2. Ransomware Guard

Galerina should support a runtime guard that detects suspicious mass file operations.

Example:

```Galerina
security {
  ransomware_guard {
    enabled true

    mass_write_limit {
      max_files 100
      window 10s
      action "pause_and_fail"
    }

    mass_rename_limit {
      max_files 50
      window 10s
      action "pause_and_fail"
    }

    mass_delete_limit {
      max_files 25
      window 10s
      action "pause_and_fail"
    }

    suspicious_extensions {
      deny [".locked", ".encrypted", ".crypt", ".ransom"]
    }

    report true
  }
}
```

---

## Suspicious Behaviour

Galerina should detect:

```text
many files modified quickly
many files renamed quickly
many files deleted quickly
file extensions changed in bulk
writes outside approved folders
repeated overwrite patterns
large numbers of encrypted-looking writes
ransom-note-like file creation
backup path modification attempts
```

---

## Mass Write Error Example

```text
Ransomware guard error:
Flow attempted to modify 420 files in 10 seconds.

Flow:
  bulkProcessDocuments

Source:
  src/jobs/document-worker.spore:44

Policy:
  max_files 100 per 10s

Action:
  paused and failed safely
```

---

## Mass Rename Error Example

```text
Ransomware guard error:
Flow attempted to rename 86 files in 10 seconds.

Detected extension pattern:
  .locked

Flow:
  processUploads

Source:
  src/uploads/process.spore:29

Action:
  operation blocked
```

---

# 3. Backup Protection

Backups must not be easy for the application to overwrite or delete.

Example:

```Galerina
security {
  backups {
    protected true

    paths [
      "./backups",
      "s3://company-backups"
    ]

    app_write "deny"
    app_delete "deny"
    immutable_required true
    separate_credentials true
  }
}
```

---

## Backup Rules

```text
Application code should not be able to delete backups.
Application code should not be able to overwrite backups.
Backup credentials should be separate from app credentials.
Immutable backups should be preferred where available.
Backup paths should be protected paths.
Backup access should appear in security reports.
```

---

## Backup Write Error Example

```text
Security policy error:
Application attempted to write to protected backup path.

Path:
  ./backups/customer-data.zip

Flow:
  exportCustomerData

Source:
  src/export/customer-export.spore:41

Suggestion:
  Write exports to an approved export folder, not the protected backup path.
```

---

# 4. Package Permissions

Third-party packages should not receive broad file, network, shell or environment access by default.

Example:

```Galerina
packages {
  use ImageTool from vendor "./vendor/image-tool" {
    version "1.2.0"

    permissions {
      file_read "allow"
      file_write "deny"
      network "deny"
      environment "deny"
      shell "deny"
      native_bindings "deny"
      unsafe "deny"
    }

    loading {
      mode "lazy"
      share_instance true
    }
  }
}
```

---

## Package Rule

```text
Packages must declare permissions.
Package file_write should be denied by default.
Package shell access should be denied by default.
Package network access should be denied unless required.
Package environment access should be denied unless required.
```

---

## Package File Write Error

```text
Package security error:
ImageTool attempted file_write but file_write permission is denied.

Package:
  ImageTool

Declared:
  boot.spore:22

Used by:
  src/images/process-image.spore:8

Action:
  operation blocked
```

---

## Package Network Risk

A package with both file write and network access is higher risk.

Example warning:

```text
Package ransomware risk warning:
Package FileSync has both file_write and network permissions.

Risk:
  A compromised package could modify files and communicate externally.

Suggestion:
  Restrict network access, restrict write paths, or isolate the package.
```

---

# 5. Shell Execution Policy

Shell execution should be denied by default.

Example:

```Galerina
security {
  shell {
    default "deny"
  }
}
```

If shell access is required, allow specific commands only:

```Galerina
security {
  shell {
    allow_commands ["convert", "ffmpeg"]
    deny_all_other true
  }
}
```

---

## Shell Rule

```text
Shell execution is denied unless explicitly allowed.
Allowed shell commands must be listed.
Shell use must appear in security reports.
Shell access from packages is denied by default.
```

---

## Shell Error Example

```text
Security policy error:
Shell execution is denied by boot.spore.

Command:
  rm -rf ./storage

Flow:
  cleanStorage

Source:
  src/maintenance/clean.spore:12

Action:
  command blocked
```

---

# 6. Declared Effects for Dangerous Operations

Flows that perform file, database, network or shell actions should declare effects.

Example:

```Galerina
secure flow processUploads(path: String) -> Result<Void, FileError>
effects [file.read, file.write] {
  ...
}
```

Destructive actions should be explicit:

```Galerina
secure flow deleteOldTempFiles() -> Result<Void, FileError>
effects [file.delete]
requires security.approved("temp_cleanup") {
  ...
}
```

---

## Effects Rule

```text
Dangerous effects must be declared.
Undeclared dangerous effects should fail check/build.
Destructive effects require explicit approval.
```

Dangerous effects include:

```text
file.write
file.delete
file.rename
file.recursive_write
file.recursive_delete
database.delete
database.truncate
database.drop
shell.exec
network.outbound
environment.read
secret.read
```

---

# 7. Database Protection

Ransomware-style attacks can corrupt or delete databases, not just files.

Galerina should require explicit policy for destructive database actions.

Example:

```Galerina
database {
  destructive_actions {
    delete "deny_by_default"
    truncate "deny"
    drop_table "deny"
    bulk_update "requires_approval"
  }
}
```

---

## Database Rule

```text
Destructive database actions are denied unless explicitly allowed.
Bulk destructive actions require approval.
DROP/TRUNCATE should be denied in production by default.
Database destructive actions must appear in security reports.
```

---

## Database Error Example

```text
Database security error:
TRUNCATE is denied by production policy.

Flow:
  resetOrders

Source:
  src/admin/reset-orders.spore:19

Action:
  operation blocked
```

---

# 8. Upload Folder Protection

Upload folders are common risk areas.

Recommended policy:

```Galerina
security {
  uploads {
    path "./public/uploads"
    executable_files "deny"
    script_extensions "deny"
    max_file_size 10mb

    deny_extensions [
      ".exe",
      ".bat",
      ".cmd",
      ".sh",
      ".ps1",
      ".php",
      ".js"
    ]

    scan_required true
  }
}
```

---

## Upload Rule

```text
Uploaded files should not be executable.
Uploaded scripts should be denied by default.
Uploads should have size limits.
Upload folders should not allow code execution.
Uploads should be scanned where possible.
```

---

# 9. Ransomware Audit Command

Galerina should include an optional audit command.

Example:

```bash
Galerina security-audit --ransomware
```

This should check for:

```text
broad file write permissions
recursive delete operations
shell execution
packages with file_write and network
backup paths writable by app
database destructive actions
upload folders executable
missing mass-write limits
missing backup protection
unprotected source/vendor folders
dangerous production overrides
```

---

## Audit Outputs

Suggested outputs:

```text
build/app.ransomware-risk-report.json
build/app.ransomware-risk-report.md
```

---

## Example Audit Report

```json
{
  "ransomwareRiskReport": {
    "status": "warning",
    "findings": [
      {
        "code": "galerina-RANSOM-001",
        "severity": "high",
        "title": "Backup path writable by application",
        "source": "boot.spore:42",
        "recommendation": "Set backups.app_write to deny and use separate backup credentials."
      },
      {
        "code": "galerina-RANSOM-002",
        "severity": "medium",
        "title": "Package has file_write and network permissions",
        "package": "FileSync",
        "source": "boot.spore:68",
        "recommendation": "Restrict package permissions or isolate package execution."
      }
    ]
  }
}
```

---

# 10. Runtime Ransomware Report

Galerina should generate a runtime security report when suspicious behaviour is blocked.

Example:

```json
{
  "ransomwareGuard": {
    "status": "blocked",
    "flow": "bulkProcessDocuments",
    "source": "src/jobs/document-worker.spore:44",
    "trigger": "mass_write_limit",
    "filesTouched": 420,
    "window": "10s",
    "action": "pause_and_fail"
  }
}
```

---

# 11. Security Report Integration

The main security report should include ransomware-relevant checks.

Example:

```json
{
  "securityReport": {
    "ransomwareResistance": {
      "status": "ok",
      "fileAccessPolicy": "restricted",
      "backupProtection": "enabled",
      "shellDefault": "deny",
      "packageFileWriteDefault": "deny",
      "massWriteGuard": "enabled",
      "databaseDestructiveActions": "restricted"
    }
  }
}
```

---

# 12. AI Guide Integration

The AI guide should include a readable ransomware-resistance summary.

Example:

```markdown
## Ransomware-Resistant Design

File access:
- Default: deny
- Write allowed: `./storage/app`, `./storage/tmp`
- Protected: `./src`, `./backups`, `./.env`, `./vendor`

Shell:
- Default: denied

Packages:
- Package file write denied by default
- Package network access denied unless approved

Backups:
- App write: denied
- App delete: denied
- Immutable required: yes

AI note:
Do not add recursive write/delete, shell execution, or backup write access without updating `boot.spore` and the security report.
```

---

# 13. Map Manifest Integration

The map manifest should connect dangerous operations to source locations.

Example:

```json
{
  "dangerousEffects": [
    {
      "effect": "file.write",
      "flow": "processUploads",
      "source": "src/uploads/process.spore:18",
      "allowed": true,
      "policy": "boot.spore:22"
    },
    {
      "effect": "file.delete",
      "flow": "deleteOldTempFiles",
      "source": "src/jobs/cleanup.spore:9",
      "allowed": true,
      "requiresApproval": true
    }
  ]
}
```

---

# 14. Build Manifest Integration

The build manifest should include a hash of ransomware-relevant security policy.

Example:

```json
{
  "ransomwarePolicyHash": "sha256:...",
  "fileAccessDefault": "deny",
  "shellDefault": "deny",
  "backupProtection": true,
  "massWriteGuard": true
}
```

This helps verify that deployments match the intended security posture.

---

# 15. Run Mode Behaviour

In Run Mode, Galerina should enforce ransomware guard policies.

Example:

```bash
Galerina run
```

Should enforce:

```text
protected paths
file write policy
shell policy
package permissions
mass write limits
backup protection
database destructive action policy
```

Development overrides should be explicit and reported.

---

# 16. Compile Mode Behaviour

In Compile Mode, Galerina should enforce production security policy.

Production builds should fail if:

```text
backup paths are writable by the app
shell is allowed broadly
file write default is allow
package file_write and network are both broad
destructive database actions are unprotected
recursive delete is allowed without approval
mass write guard is disabled for file-heavy apps
```

---

# 17. Security Audit Mode

Optional command:

```bash
Galerina security-audit --ransomware
```

Should perform deeper checks than normal run/build.

It may generate:

```text
ransomware-risk-report.json
ransomware-risk-report.md
security-report.json
AI guide warnings
```

---

# 18. Recommended Policy Example

```Galerina
security {
  ransomware_guard {
    enabled true
    default_file_write "deny"
    recursive_write "deny_by_default"
    shell "deny"
    package_file_write "deny_by_default"

    mass_write_limit {
      max_files 100
      window 10s
      action "pause_and_fail"
    }

    mass_rename_limit {
      max_files 50
      window 10s
      action "pause_and_fail"
    }

    mass_delete_limit {
      max_files 25
      window 10s
      action "pause_and_fail"
    }

    protected_paths [
      "./src",
      "./compiler",
      "./schemas",
      "./backups",
      "./.env",
      "./vendor"
    ]

    backups {
      app_write "deny"
      app_delete "deny"
      immutable_required true
      separate_credentials true
    }

    reports {
      ransomware_report true
      security_report true
      ai_guide true
    }
  }
}
```

---

# 19. Safe File Processing Example

```Galerina
secure flow processUpload(path: String) -> Result<ProcessedFile, FileError>
effects [file.read, file.write] {
  let input = file.read(path)?

  let output = transformFile(input)

  file.write("./storage/app/processed/output.dat", output)?

  return Ok(ProcessedFile {
    path: "./storage/app/processed/output.dat"
  })
}
```

Valid because:

```text
file.read is declared
file.write is declared
write path is approved
flow does not touch protected paths
flow does not use shell
```

---

# 20. Unsafe File Processing Example

```Galerina
secure flow encryptDocuments(folder: String) -> Result<Void, FileError>
effects [file.recursive_write, file.rename] {
  for file in file.listRecursive(folder) {
    let data = file.read(file.path)?
    let encrypted = crypto.encrypt(data)
    file.write(file.path + ".locked", encrypted)?
    file.delete(file.path)?
  }

  return Ok()
}
```

Galerina should flag this as high risk.

Example warning:

```text
Ransomware risk warning:
Flow recursively reads, writes, renames and deletes files.

Flow:
  encryptDocuments

Source:
  src/jobs/encrypt-documents.spore:1

Risk:
  Behaviour resembles ransomware-style mass file modification.

Action:
  Requires explicit ransomware_guard exception and security audit.
```

---

# 21. Exception Policy

Some legitimate jobs may modify many files.

Example:

```text
image processing batch
document conversion
log rotation
backup creation
static site generation
media transcoding
```

These should require explicit exceptions.

```Galerina
security {
  ransomware_guard {
    exceptions [
      {
        name "static_site_generation"
        flow "generateStaticSite"
        allow_mass_write true
        allowed_path "./build/site"
        max_files 5000
        audit_required true
      }
    ]
  }
}
```

---

## Exception Rule

```text
Mass file operations require named exceptions.
Exceptions must be path-limited.
Exceptions must be reported.
Production exceptions should require audit.
```

---

# 22. Production Recommendations

Recommended production defaults:

```text
file access default: deny
shell default: deny
package file_write: deny
package network: deny unless required
protected backups: enabled
immutable backups: required where possible
recursive write/delete: deny by default
mass write guard: enabled
database destructive actions: denied or approval-only
upload executable files: denied
```

---

# 23. Non-Goals

Ransomware-Resistant Design should not:

```text
claim to stop all ransomware
replace operating-system permissions
replace endpoint detection and response
replace immutable backups
replace MFA
replace patching
replace least-privilege cloud permissions
replace professional incident response planning
```

Galerina should help developers build safer applications, but infrastructure and operational security still matter.

---

# 24. Open Questions

```text
Should ransomware_guard be enabled by default for all file-writing apps?
Should production builds fail if backups are writable by the app?
Should file.write require explicit path allowlist?
Should package file_write be denied by default?
Should shell execution require security-audit approval?
Should mass file operation exceptions require named approvals?
Should suspicious extension lists be configurable?
Should cloud backup immutability be checked by deployment integrations?
Should Galerina generate recovery-readiness reports?
```

---

# 25. Recommended Early Version

## Version 0.1

```text
file access policy
protected paths
package file_write permission
shell default deny
dangerous effects declaration
basic ransomware audit report
```

## Version 0.2

```text
mass write detection
mass rename detection
mass delete detection
backup protection policy
database destructive action policy
AI guide ransomware summary
```

## Version 0.3

```text
runtime ransomware guard
exception policy
upload folder protection
build manifest policy hash
map manifest dangerous effects
```

## Version 0.4

```text
cloud backup immutability checks
active security audit mode
package behavioural sandboxing
recovery-readiness report
```

---

# Final Principle

Galerina should make ransomware-style behaviour difficult to write accidentally and easy to audit.

Final rule:

```text
Do not trust file access by default.
Allow only specific folders.
Deny shell by default.
Deny package file writes by default.
Protect backups from the app itself.
Detect mass file changes.
Report risky flows.
Fail safely before destructive behaviour spreads.
```

Galerina cannot replace operational security, but it can make Galerina applications much more resistant to ransomware-style misuse.
