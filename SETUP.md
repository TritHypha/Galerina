# Galerina — Setup Guide

Install Galerina on Windows, Linux, or macOS. The `galerina` command lets you compile `.fungi` programs to WebAssembly, run them, and type-check with full governance.

---

## Prerequisites — all platforms

You need **Node.js 18 or later**. Check your version:

```bash
node --version   # should print v18.x.x or higher
```

If you don't have it: https://nodejs.org (LTS version recommended)

---

## Windows

### Step 1 — Open PowerShell as Administrator

Right-click the Start button → **"Windows Terminal (Admin)"** or search for **PowerShell**, right-click → **"Run as administrator"**.

You should see `PS C:\WINDOWS\system32>` or similar with `(Admin)` in the title bar.

### Step 2 — Allow scripts (one-time fix for npm)

PowerShell blocks scripts by default. Run this **once** to allow signed scripts:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

Type `Y` and press Enter to confirm.

### Step 3 — Clone and link

```powershell
git clone https://github.com/galerina/Galerina.git
cd Galerina
npm link
```

### Step 4 — Verify

```powershell
galerina --help
```

You should see the Galerina CLI help. If PowerShell still blocks it, use **Command Prompt** (`cmd.exe`) instead — it has no script restrictions:

```cmd
cd <GitHub>\Galerina
npm link
galerina --help
```

### Optional — wasmtime (run compiled .wasm binaries)

Download from https://wasmtime.dev or via winget:

```powershell
winget install BytecodeAlliance.Wasmtime
```

---

## Linux

### Step 1 — Install Node.js 18+

**Ubuntu / Debian:**
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

**Fedora / RHEL:**
```bash
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs
```

**Arch:**
```bash
sudo pacman -S nodejs npm
```

### Step 2 — Clone and link

```bash
git clone https://github.com/galerina/Galerina.git
cd Galerina
npm link
```

If you get a permissions error on `npm link`, use:
```bash
sudo npm link
```

Or configure npm to use a local prefix (no sudo):
```bash
mkdir -p ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
npm link
```

### Step 3 — Verify

```bash
galerina --help
```

### Optional — wasmtime

```bash
curl https://wasmtime.dev/install.sh -sSf | bash
```

---

## macOS

### Step 1 — Install Node.js 18+

**Via Homebrew** (recommended):
```bash
brew install node
```

**Via nvm** (if you need multiple Node versions):
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc   # or ~/.zshrc on zsh
nvm install 20
nvm use 20
```

### Step 2 — Clone and link

```bash
git clone https://github.com/galerina/Galerina.git
cd Galerina
npm link
```

### Step 3 — Verify

```bash
galerina --help
```

### Optional — wasmtime

```bash
brew install wasmtime
# or:
curl https://wasmtime.dev/install.sh -sSf | bash
```

---

## Running your first program

Once `galerina` is on your PATH, try the governance-cost benchmark — it computes the sum of 1 to 100 (= 5050, the Gauss problem) with full governance verification:

**Run it:**
```bash
galerina run packages-galerina/galerina-devtools-benchmarks/benchmarks/governance-cost/benchmark.fungi --invoke main
# → 5050
```

**Compile to WebAssembly:**
```bash
galerina build packages-galerina/galerina-devtools-benchmarks/benchmarks/governance-cost/benchmark.fungi
# → build/benchmark.wasm  (~130 bytes — governance compiled in, no runtime attached)
# → build/benchmark.wat
```

**Run the compiled WASM with wasmtime (no Node.js needed):**
```bash
wasmtime --invoke main build/benchmark.wasm
# → 5050
```

**Type-check with governance:**
```bash
galerina check examples/auth-service/verifyPassword.fungi
# → ✅ verifyPassword.fungi: 0 errors, 0 governance warnings
```

---

## Running the benchmarks

The benchmark suite compares Galerina's WASM output against Rust (generic + AVX2), Node.js, Python, and real GPU across 36 workloads.

```bash
cd packages-galerina/galerina-devtools-benchmarks

# Run all benchmarks (takes 5–10 minutes):
npm run run

# Show the comparison table (uses last saved results):
npm run compare
```

The canonical view is the **§1.5 production-ceiling scoreboard** printed by `npm run compare` — it compares the shipping **WASM ▶ production** path against the fastest real runtime per workload. Two honesty rules built into the harness: the Stage-A interpreter tiers are *diagnostic* (the WASM parity oracle) and are excluded from winning, and any lane without verified work-equivalence carries **no** cross-runtime ratio. A truth-audit (cross-language checksums + unit alignment) runs with every full suite.

**Quick benchmark (development feedback, ~30 seconds):**
```bash
npm run run -- --quick
```

---

## Where are the examples?

```
Galerina/
├── examples/
│   └── auth-service/           ← 31 real governed flows
│       ├── verifyPassword.fungi       verify a user password
│       ├── governanceService.fungi    proof-graph generation
│       ├── runtimeProfileService.fungi security profiles
│       ├── sovereignTransaction.fungi  Tier 1 ASIC hardening example
│       └── ...28 more flows
│
├── packages-galerina/
│   └── galerina-devtools-benchmarks/
│       └── benchmarks/
│           ├── governance-cost/    benchmark.fungi ← good starting point
│           ├── nbody/              benchmark.fungi
│           ├── data-query/         benchmark.fungi
│           └── ...20 more
│
└── tests/
    └── r6-corpus/              ← 5 verified reference flows
        ├── r6-001-classify.fungi
        ├── r6-002-distance.fungi
        ├── r6-003-listlen.fungi
        ├── r6-004-record-amount.fungi
        └── r6-005-name-of.fungi
```

Open any `.fungi` file in VS Code to see Galerina source with full governance contracts.

---

## Hello World

> **Important for AI tools and developers coming from TypeScript/Go/Rust:**
> The `contract {}` block sits **between** the flow signature and the body `{}`.
> It is NOT inside the body — it is a compile-time declaration that comes before it.
>
> ```
> pure flow name(params) -> ReturnType   ← 1. signature
> contract { ... }                        ← 2. compile-time declaration (OUTSIDE body)
> {                                       ← 3. body opens here
>   ...runtime code...
> }
> ```
>
> If you write `contract {}` *inside* the body braces, that is the old syntax and will not work correctly.

```galerina
// ── hello.fungi ─────────────────────────────────────────────────────────────────
//
// Your first Galerina flow.
//
// Galerina is a governed language — every flow (function) declares what it does
// in a `contract {}` block. This is not documentation; the compiler enforces it.
//
// Key ideas:
//   - `pure flow`  = no side effects, no network, no database. Provably safe.
//   - `contract`   = machine-verified declaration of intent + rules (OUTSIDE body).
//   - `intent`     = what this flow is FOR (required for secure/governed flows).
//   - `return`     = explicit return. No hidden control flow.
// ──────────────────────────────────────────────────────────────────────────────

// A flow is like a function, but it carries a governance contract.
//
// `pure` means: no side effects whatsoever.
//   The compiler will reject this flow if it tries to write to a database,
//   call the network, or mutate global state. It's provably pure.
//
// `greet` is the flow name — fully spelled, no abbreviations (e.g. not `greet` → `g`).
//
// `(name: String)` is the parameter — typed and named explicitly.
//
// `-> String` is the return type — always declared. No implicit returns.

pure flow greet(name: String) -> String
contract {
  // `intent` tells the compiler, AI tools, and human reviewers what this flow
  // is FOR. It's required for any governed/secure flow. The compiler checks that
  // your declared intent doesn't contradict your declared effects.
  intent { "Produce a personalised greeting string for the given name." }

  // No `effects {}` block — because this is a pure flow.
  // Effects are deny-by-default: omitting effects means the compiler
  // GUARANTEES this flow cannot write to a database, call the network,
  // or produce any observable side effect. It's mathematically pure.
}
{
  // The flow body. Plain Galerina expressions.
  //
  // `return` is explicit — Galerina has no implicit last-expression return.
  // `+` on strings is concatenation (no toString() needed, types are explicit).
  return "Hello, " + name + "! Welcome to Galerina."
}


// ── Running this flow ─────────────────────────────────────────────────────────
//
//   galerina run hello.fungi --invoke greet
//   → Hello, World! Welcome to Galerina.
//
//   galerina build hello.fungi
//   → build/hello.wasm (tiny, runs without Node.js via wasmtime)
//
//   galerina check hello.fungi
//   → ✅ hello.fungi: 0 errors, 0 governance warnings
//
// ──────────────────────────────────────────────────────────────────────────────


// ── Going further: a governed flow with effects ───────────────────────────────
//
// When a flow writes to a log, database, or network, it must declare the effect.
// Effects are deny-by-default: if you don't declare it, the compiler rejects it.
//
// `secure` means: this flow has at least one side effect and must be
// explicitly governed. The compiler requires an `intent` block.

secure flow greetAndLog(name: String) -> String
contract {
  intent { "Greet the user and record the greeting in the audit log." }

  // Declare the side effect explicitly.
  // The compiler verifies that the flow body actually performs this effect
  // and only this effect — no surprise database writes or network calls.
  effects { audit.write }
}
{
  let greeting: String = "Hello, " + name + "!"

  // AuditLog.write is a governed effect — it goes into the tamper-evident
  // audit trail. The compiler knows about this because we declared
  // `effects { audit.write }` above. If we removed that declaration,
  // the compiler would error: "undeclared effect: audit.write".
  AuditLog.write("Greeted: " + name)

  return greeting
}


// ── Key differences from TypeScript / Python / Go ────────────────────────────
//
// TypeScript:   function greet(name: string): string { return `Hello, ${name}!` }
//               → No governance. No guarantee about side effects.
//               → An AI or refactor could silently add a database write.
//
// Galerina:       pure flow greet(name: String) -> String  contract { ... }  { ... }
//               → Compiler PROVES no side effects possible.
//               → Any attempt to add a database write causes a compile error.
//               → The intent is machine-readable and auditable.
//
// This is why Galerina targets software handling money, PII, healthcare,
// and government data — where "I think this is pure" is not good enough.
// ──────────────────────────────────────────────────────────────────────────────
