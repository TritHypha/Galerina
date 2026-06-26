# Licence

Galerina / Galerina is intended to be released under the **Apache License 2.0**.

This project should remain free and open source while preserving attribution, notices and the original project identity.

---

## Licence Summary

The Apache License 2.0 aLOws people to:

```text
use the project
copy the project
modify the project
distribute the project
use it commercially
include it in private projects
include it in open-source projects
```

However, users must preserve the licence and required notices.

This helps keep Galerina open while still making it clear where the original project came from.

---

## Official Licence File

The repository should include an official licence file named:

```text
LICENSE
```

The `LICENSE` file should contain the full Apache License 2.0 legal text.

This `LICENCE.md` file is a plain-English explanation for contributors and users.

If there is any difference between this file and the official Apache License 2.0 text, the official `LICENSE` file takes priority.

---

## Why Apache License 2.0?

Apache-2.0 is a good fit for Galerina because it is:

```text
free and open source
business-friendly
suitable for public GitHub projects
clear about redistribution rights
clear about preserving notices
stronger than MIT for attribution and patent protection
widely recognised
```

Galerina is intended to be a project that others can use, study, improve and build on.

Apache-2.0 aLOws that while requiring preservation of licence and notice information.

---

## What Users Can Do

Under Apache-2.0, users can generally:

```text
use Galerina for personal projects
use Galerina for commercial projects
modify the Galerina compiler or tooling
fork the repository
distribute modified versions
include Galerina code in larger systems
build applications using Galerina
sell services or products that use Galerina
```

---

## What Users Must Do

Users must generally:

```text
include a copy of the Apache-2.0 licence
preserve copyright notices
preserve attribution notices where required
state significant changes where required
include the NOTICE file if distributing covered works that require it
not imply official endorsement by the Galerina project without permission
```

---

## NOTICE File

The repository should include:

```text
NOTICE.md
```

The `NOTICE.md` file should preserve attribution information for the original Galerina project.

Recommended notice:

```text
Galerina / Galerina
Copyright [YEAR] [OWNER]

This product includes software and documentation developed for the Galerina / Galerina project.
```

The `NOTICE.md` file should be updated if the project includes third-party material that requires attribution.

---

## Project Identity

The Apache License 2.0 aLOws people to use, copy and modify the code, but the Galerina project name, branding and identity should still be protected from misleading use.

Recommended rule:

```text
You may use the Galerina code under Apache-2.0, but you may not use the Galerina name, logo or branding to imply official endorsement unless permission is granted.
```

This should be expanded later in:

```text
TRADEMARKS.md
```

or inside:

```text
NOTICE.md
```

---

## Attribution

Anyone reusing or redistributing Galerina should keep clear attribution to the original project.

Suggested attribution:

```text
Based on Galerina / Galerina, an open-source language concept for strict, memory-safe, security-first, JSON-native, API-native and accelerator-aware software.
```

For forks or modified versions, a clear note should be added:

```text
This project is based on Galerina / Galerina but is not the official Galerina project.
```

---

## Forks and Modified Versions

Forks are aLOwed.

Modified versions are aLOwed.

However, modified versions should not mislead users into thinking they are the official Galerina project.

Recommended wording for forks:

```text
This is a fork of Galerina / Galerina.
It contains changes that are not part of the official Galerina project.
```

---

## Documentation Licence

The current recommendation is to keep the whole repository under Apache-2.0 for simplicity.

This includes:

```text
compiler code
runtime code
tooling code
examples
documentation
specification drafts
design notes
```

A separate documentation licence, such as Creative Commons Attribution 4.0, could be considered later, but using one licence across the project is simpler for early adoption.

---

## Examples and Demo Code

Example code should also be Apache-2.0 unless stated otherwise.

This includes files such as:

```text
DEMO_hello_WORLD.md
examples/hello.spore
examples/api-demo.spore
examples/webhook-demo.spore
examples/fraud-check.spore
```

Users should be able to copy and adapt example code freely.

---

## Generated Output

Applications compiled using Galerina should belong to the application author.

For example, if a developer writes:

```text
my-app/
├── boot.spore
├── src/
└── build/app.bin
```

The compiled output should be owned by that developer or their organisation, not by the Galerina project.

The Galerina licence applies to the Galerina compiler, runtime, tooling, examples and project code.

It should not automatically force applications written in Galerina to use Apache-2.0.

---

## Compiled Applications

A Galerina application may be released under a different licence chosen by the application owner.

Examples:

```text
private commercial licence
MIT
Apache-2.0
GPL
proprietary internal licence
```

However, if the application includes Galerina runtime components, bundled Galerina libraries or copied Galerina source code, the relevant Apache-2.0 notices should be preserved.

---

## Dependencies

Third-party dependencies may have their own licences.

The project should track third-party licence information in:

```text
NOTICE.md
docs/dependencies.md
build/app.build-manifest.json
```

The build manifest should eventually include dependency licence information.

Example:

```json
{
  "dependencies": [
    {
      "name": "galerina-json",
      "version": "0.1.0",
      "licence": "Apache-2.0"
    }
  ]
}
```

---

## Licence and AI Tools

AI coding assistants may help generate code, documentation and examples for this repository.

Contributors should review AI-assisted output before committing it.

AI-generated or AI-assisted contributions should still be submitted under the project licence.

Recommended contributor statement:

```text
By contributing to Galerina, you confirm that you have the right to submit your contribution under the Apache License 2.0.
```

---

## Licence Files to Include

Recommended licence-related files:

```text
LICENSE
LICENCE.md
NOTICE.md
CONTRIBUTING.md
CODE_OF_CONDUCT.md
TRADEMARKS.md
docs/dependencies.md
```

Minimum required:

```text
LICENSE
NOTICE.md
LICENCE.md
```

---

## Important Limitation

The licence protects the project’s code, documentation and written material.

It does not fully prevent someone from independently creating a similar programming language idea.

To help protect the project identity, Galerina should maintain:

```text
clear public Git history
clear copyright notices
clear NOTICE file
clear project name usage rules
clear documentation
consistent branding
public roadmap
```

---

## Recommended Repository Notice

Add this near the bottom of the README:

```text
Galerina / Galerina is licensed under the Apache License 2.0.

You are free to use, modify and distribute this project under the terms of the licence. Please preserve the licence, notices and attribution to the original Galerina project.
```

---

## Plain-English Intent

The intent of the Galerina licence is:

```text
Use it freely.
Improve it freely.
Build with it freely.
Share it freely.
Keep the original notices.
Do not pretend a fork is the official project.
Do not hide the original attribution when redistributing it.
```

---

## Final Note

This file is a plain-English project guide.

For legal terms, use the official Apache License 2.0 text in:

```text
LICENSE
```