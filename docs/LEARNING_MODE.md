# Galerina Learning Mode

Galerina should have a learning mode for students, children, new developers and
teachers.

The goal is not to make a separate toy language. Learning mode should teach real
Galerina concepts with safer defaults, simpler wording, guided exercises and
strong guardrails.

Core rule:

```text
Learning mode should make Galerina easier to understand without teaching unsafe
habits or fake syntax.
```

## Audience

Learning mode should support:

```text
children learning first programming ideas
students learning typed programming
teachers running classroom exercises
new developers learning Galerina syntax
experienced developers learning Galerina safety rules
AI-assisted learners who need explanations, hints and safe examples
```

Different audiences need different levels, not different languages.

## Learning Levels

Galerina should support progressive learning levels:

```text
Level 0: Blocks or guided forms
Level 1: Simple text syntax
Level 2: Typed app syntax
Level 3: Errors, Result and Option
Level 4: Effects, permissions and security
Level 5: Packages, APIs, reports and deployment
```

Example:

```text
Beginner:
  print "Hello Galerina"

Student:
  let name: Text = "Ada"
  print "Hello " + name

App developer:
  flow greet(name: Text) -> Text {
    return "Hello " + name
  }
```

The learner should be able to reveal the next level rather than being forced
into advanced syntax too early.

## Learning Mode Defaults

Learning mode should default to:

```text
safe execution only
no filesystem writes unless explicitly allowed
no network access unless explicitly allowed
no shell access
no secrets
small memory limits
short runtime limits
clear diagnostics
example-first explanations
step-by-step hints
report output for teachers and learners
```

It should run in a sandboxed or checked mode where possible. Exercises should be
safe to run on school computers, shared laptops and browser playgrounds.

## Friendly Diagnostics

Normal compiler diagnostics can be precise but intimidating. Learning mode
should add beginner-friendly explanations:

```text
Compiler diagnostic:
  Type mismatch: expected Number, found Text.

Learning explanation:
  This value is text, but this part of the program needs a number.
  Try converting the text to a number, or use a number value here.
```

Diagnostics should include:

```text
what happened
why it matters
one small fix
one example
link to the relevant lesson
```

Learning diagnostics must not hide real errors. They should explain them.

## Guided Lessons

Learning mode should include lessons for core Galerina ideas:

```text
values and variables
Text, Number and Bool
if and match
lists and maps
functions and flows
Result and Option
validation
safe input handling
permissions and effects
JSON and typed API data
basic app routes
reports
testing
```

Security should be taught early in simple language:

```text
Do not trust input until Galerina checks it.
Do not print or store secrets.
Ask permission before using files, network or shell.
Use Result when something can fail.
Use Option when something might be missing.
```

## Exercises

Each lesson should include:

```text
goal
starter code
expected output
hints
solution
explanation
common mistakes
report
```

Example exercise:

```text
Goal:
  Ask for a name and print a greeting.

Starter:
  let name: Text = input "What is your name?"
  print "Hello " + name

Learning point:
  Text values can be joined with other text.
```

For younger learners, exercises should avoid:

```text
credentials
real payments
real external APIs
real personal data
unsafe network calls
filesystem mutation
```

## Playground

Galerina should eventually support a learning playground:

```text
browser or local mode
single-file exercises
safe run button
visual output panel
diagnostics panel
hints panel
report panel
teacher view
```

Playground execution should deny:

```text
shell execution
raw filesystem access
network by default
secret access
unsafe imports
long-running loops
large memory allocation
```

If browser execution is used, `galerina-target-js`, `galerina-target-wasm` and
`galerina-web-*` planning should provide the output target and safe UI boundary.
Learning mode itself should remain a product mode, not a browser framework.

## Teacher Mode

Teacher mode should help instructors run a class without exposing private
student data.

Useful outputs:

```text
lesson progress
exercise completion
diagnostic categories
common mistake summary
time spent per exercise
hint usage
```

Reports must not expose:

```text
private messages
secret values
unnecessary personal data
raw student identifiers in shareable reports
```

Teacher reports should support pseudonymous IDs and local export before any
future hosted service is considered.

## AI Tutor

An AI tutor can help explain Galerina, but it must be bounded.

Allowed:

```text
explain diagnostics
give hints
suggest small fixes
ask guiding questions
generate practice examples
summarise learner progress
```

Denied by default:

```text
solving every exercise immediately
collecting personal data
contacting external services without approval
changing files outside the exercise
using secrets
running shell commands
```

AI tutor output should be labelled as guidance and should not replace compiler
checks.

## Child-Safe Rules

For children, learning mode should be conservative:

```text
no open chat by default
no public sharing by default
no external network by default
no collection of age, school or personal identity unless required and approved
no unsafe links
no secret prompts
no real-money examples
no production deployment exercises
```

Example projects should use safe domains:

```text
quiz
calculator
story builder
weather model with fake data
pet tracker with local sample data
school timetable with sample data
simple game logic
```

For real schools, legal and privacy requirements depend on jurisdiction and
institution policy. Galerina must not claim automatic education privacy
compliance.

## Reports

Learning mode should generate:

```text
app.learning-report.json
app.lesson-progress-report.json
app.exercise-diagnostic-report.json
app.teacher-summary-report.json
app.ai-tutor-report.json
```

Example:

```json
{
  "mode": "learning",
  "lesson": "result-and-option",
  "exercise": "missing-profile-photo",
  "status": "needs_hint",
  "diagnostics": [
    {
      "code": "GALERINA-LEARN-TYPE-001",
      "topic": "Option",
      "message": "This value might be missing. Match on it before rendering."
    }
  ],
  "unsafeActionsBlocked": ["network.open"],
  "personalDataIncluded": false
}
```

## Package Ownership

Learning mode should start as documentation and CLI/runtime behaviour, not a new
active package.

Potential future package names:

```text
galerina-learn
galerina-learn-lessons
galerina-learn-playground
galerina-learn-teacher
```

Do not add these packages until the core language examples, parser/checker and
learning content shape are stable enough to justify package ownership.

Related ownership:

```text
galerina-core
  real language syntax, examples and diagnostics

galerina-core-cli
  future learning-mode commands

galerina-core-runtime
  checked/sandboxed execution policy

galerina-core-security
  permission, secret and child-safe policy

galerina-core-reports
  learning report contracts if shared broadly

galerina-web-* and target packages
  future browser playground output, if needed
```

## Commands

Possible future commands:

```bash
galerina learn list
galerina learn start basics
galerina learn run lesson-01
galerina learn hint
galerina learn explain GALERINA-TYPE-001
galerina learn teacher-report
```

These commands should never require production deployment, real secrets or
external services.

## Non-Goals

Learning mode should not become:

```text
a separate fake Galerina language
a production sandbox guarantee
an unbounded AI tutor
a classroom surveillance tool
a hosted education product by default
a replacement for compiler checks
```

Learning mode should teach real Galerina, slowly and safely.
