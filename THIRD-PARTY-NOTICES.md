# Third-Party Notices

**Galerina** — Copyright 2026 PHILLIP BOOTH — Licensed under the Apache License, Version 2.0.

This file lists the third-party software that Galerina bundles, links against, or
otherwise distributes, and reproduces the attribution and licence information for
each component.

---

## Preamble

**Every third-party component below is licensed under a permissive open-source
licence (MIT, BSD-3-Clause, ISC, or Apache-2.0).** None impose copyleft or
share-alike obligations, and all are free for unrestricted commercial use —
including sale and sublicensing — with no royalty, fee, or field-of-use
restriction. All are compatible with Galerina's own Apache-2.0 licence.

The only obligations these licences impose are attribution-related:

- **MIT / ISC** — retain the copyright notice and the permission/licence text in
  all copies, in both source and binary distributions.
- **BSD-3-Clause** — retain the copyright notice, the list of conditions, and the
  disclaimer, and honour the no-endorsement clause (clause 3).
- **Apache-2.0** — retain copyright, patent, trademark, and attribution notices,
  and — *if and only if* an upstream component ships a `NOTICE` text file —
  reproduce its contents. None of the Apache-2.0 components below ship a `NOTICE`
  file, so there is no additional NOTICE text to propagate beyond this file.

**On "referencing the source":** none of these licences *require* a link back to
the upstream project. As a matter of courtesy, Galerina nonetheless credits every
component with its source URL in the inventory and per-component sections below.

These notices are included in both the source and binary distributions of Galerina.

---

## Summary inventory

28 third-party packages (MIT ×21 · Apache-2.0 ×4 · ISC ×2 · BSD-3-Clause ×1),
plus bundled subcomponents. Source links are provided as a courtesy.

| Component | Version | Licence | Copyright / Author | Source (courtesy) |
|---|---|---|---|---|
| @noble/post-quantum | 0.6.1 | MIT | Copyright (c) 2024 Paul Miller | https://github.com/paulmillr/noble-post-quantum |
| @noble/hashes | 2.2.0 | MIT | Copyright (c) 2022 Paul Miller | https://github.com/paulmillr/noble-hashes |
| @noble/curves | 2.2.0 | MIT | Copyright (c) 2022 Paul Miller | https://github.com/paulmillr/noble-curves |
| @noble/ciphers | 2.2.0 | MIT | Copyright (c) 2022 Paul Miller; Copyright (c) 2016 Thomas Pornin | https://github.com/paulmillr/noble-ciphers |
| @phc/format | 1.0.0 | MIT | Copyright (c) 2018-2020 Simone Primarosa | https://github.com/simonepri/phc-format |
| argon2 | 0.44.0 | MIT | Copyright (c) 2015 Ranieri Althoff | https://github.com/ranisalt/node-argon2 |
| bcryptjs | 3.0.3 | BSD-3-Clause | Copyright (c) 2012 Nevins Bartolomeo; Copyright (c) 2012 Shane Girish; Copyright (c) 2025 Daniel Wirtz | https://github.com/dcodeIO/bcrypt.js |
| wabt | 1.0.39 | Apache-2.0 | Copyright 2015 the repository authors (AUTHORS file) | https://github.com/AssemblyScript/wabt.js |
| wabt (nested under wat-wasm) | 1.0.23 | Apache-2.0 | Copyright 2015 the repository authors (AUTHORS file) | https://github.com/AssemblyScript/wabt.js |
| wat-wasm | 1.0.43 | MIT | Copyright (c) Rick Battagline (wasmbook.com) | https://github.com/battlelinegames/wat-wasm |
| binaryen | 98.0.0 | Apache-2.0 | The AssemblyScript / Binaryen Authors (WebAssembly Community Group) | https://github.com/AssemblyScript/binaryen.js |
| node-addon-api | 8.8.0 | MIT | Copyright (c) 2017 Node.js API collaborators | https://github.com/nodejs/node-addon-api |
| node-gyp-build | 4.8.4 | MIT | Copyright (c) 2017 Mathias Buus | https://github.com/prebuild/node-gyp-build |
| cross-env | 10.1.0 | MIT | Copyright (c) 2017-2025 Kent C. Dodds | https://github.com/kentcdodds/cross-env |
| cross-spawn | 7.0.6 | MIT | Copyright (c) 2018 Made With MOXY Lda | https://github.com/moxystudio/node-cross-spawn |
| which | 2.0.2 | ISC | Copyright (c) Isaac Z. Schlueter and Contributors | https://github.com/isaacs/node-which |
| isexe | 2.0.0 | ISC | Copyright (c) Isaac Z. Schlueter and Contributors | https://github.com/isaacs/isexe |
| path-key | 3.1.1 | MIT | Copyright (c) Sindre Sorhus | https://github.com/sindresorhus/path-key |
| shebang-command | 2.0.0 | MIT | Copyright (c) Kevin Mårtensson | https://github.com/kevva/shebang-command |
| shebang-regex | 3.0.0 | MIT | Copyright (c) Sindre Sorhus | https://github.com/sindresorhus/shebang-regex |
| chalk | 3.0.0 | MIT | Copyright (c) Sindre Sorhus | https://github.com/chalk/chalk |
| ansi-styles | 4.3.0 | MIT | Copyright (c) Sindre Sorhus | https://github.com/chalk/ansi-styles |
| supports-color | 7.2.0 | MIT | Copyright (c) Sindre Sorhus | https://github.com/chalk/supports-color |
| has-flag | 4.0.0 | MIT | Copyright (c) Sindre Sorhus | https://github.com/sindresorhus/has-flag |
| color-convert | 2.0.1 | MIT | Copyright (c) 2011-2016 Heather Arthur | https://github.com/Qix-/color-convert |
| color-name | 1.1.4 | MIT | Copyright (c) 2015 Dmitry Ivanov | https://github.com/colorjs/color-name |
| @epic-web/invariant | 1.0.0 | MIT | Kent C. Dodds | https://github.com/epicweb-dev/invariant |
| typescript *(build-time / dev)* | 5.9.3 | Apache-2.0 | Copyright (c) Microsoft Corporation | https://github.com/microsoft/TypeScript |

**Bundled subcomponents** (shipped *inside* the packages above):

| Subcomponent | Bundled in | Licence | Copyright | Source (courtesy) |
|---|---|---|---|---|
| phc-winner-argon2 (C reference) | argon2 | CC0-1.0 OR Apache-2.0 | Copyright 2015 Daniel Dinu, Dmitry Khovratovich, Jean-Philippe Aumasson, Samuel Neves | https://github.com/P-H-C/phc-winner-argon2 |
| BLAKE2 | argon2 → phc-winner-argon2 | CC0-1.0 OR Apache-2.0 | (same authors as above) | https://github.com/P-H-C/phc-winner-argon2 |
| FP16 *(provenance only — compiled into wasm-opt, source not redistributed)* | binaryen | MIT | Copyright (c) Marat Dukhan | https://github.com/Maratyszcza/FP16 |

> `typescript` is a build-time **dev dependency** (it compiles Galerina's TypeScript
> sources; it is not shipped in distributed artifacts). It is listed here for
> completeness. All other components may be present in distributed artifacts.

---

## 1. Cryptographic components

### @noble/post-quantum 0.6.1 — MIT
ML-KEM / ML-DSA / SLH-DSA post-quantum primitives.
```
Copyright (c) 2024 Paul Miller (https://paulmillr.com)
```
Source: https://github.com/paulmillr/noble-post-quantum

### @noble/hashes 2.2.0 — MIT
SHA-256 / SHA-3 / HMAC and related hashing.
```
Copyright (c) 2022 Paul Miller (https://paulmillr.com)
```
Source: https://github.com/paulmillr/noble-hashes

### @noble/curves 2.2.0 — MIT
Ed25519 / elliptic-curve signatures.
```
Copyright (c) 2022 Paul Miller (https://paulmillr.com)
```
Source: https://github.com/paulmillr/noble-curves

### @noble/ciphers 2.2.0 — MIT
AEAD symmetric ciphers (ChaCha20-Poly1305 / AES).
```
Copyright (c) 2022 Paul Miller (https://paulmillr.com)
Copyright (c) 2016 Thomas Pornin <pornin@bolet.org>
```
*(The second copyright line covers the AES / BearSSL-derived code.)*
Source: https://github.com/paulmillr/noble-ciphers

### @phc/format 1.0.0 — MIT
PHC password-hash string format (dependency of argon2).
```
Copyright (c) 2018-2020 Simone Primarosa
```
Source: https://github.com/simonepri/phc-format

### argon2 0.44.0 — MIT (top-level package)
Native Argon2id key-derivation binding.
```
Copyright (c) 2015 Ranieri Althoff
```
Source: https://github.com/ranisalt/node-argon2
*See [Bundled subcomponents](#4-bundled-subcomponents) for the bundled
phc-winner-argon2 C reference implementation, which is separately licensed.*

### bcryptjs 3.0.3 — BSD-3-Clause
Pure-JS bcrypt password hashing.
```
Copyright (c) 2012 Nevins Bartolomeo <nevins.bartolomeo@gmail.com>
Copyright (c) 2012 Shane Girish <shaneGirish@gmail.com>
Copyright (c) 2025 Daniel Wirtz <dcode@dcode.io>
```
Source: https://github.com/dcodeIO/bcrypt.js
*Per clause 3, the names of the authors may not be used to endorse or promote
products derived from this software without specific prior written permission.
The shipped LICENSE uses the historical "THE AUTHOR" phrasing; its SPDX
classification remains BSD-3-Clause.*

---

## 2. WebAssembly toolchain

### wabt 1.0.39 — Apache-2.0
WebAssembly Binary Toolkit (wat ↔ wasm), AssemblyScript/wabt.js build.
```
Copyright 2015 the repository authors, see AUTHORS file.
```
Source: https://github.com/AssemblyScript/wabt.js — used unmodified; no NOTICE file shipped.

### wat-wasm 1.0.43 — MIT
WAT/WASM assembler used by the compiler backend.
```
Copyright (c) Rick Battagline (rick@battagline.com, wasmbook.com)
```
Source: https://github.com/battlelinegames/wat-wasm
*wat-wasm declares MIT in its npm metadata but ships no licence text of its own;
the notice above is reconstructed from the package's authorship metadata. It
bundles the Apache-2.0 components `binaryen@98.0.0` and `wabt@1.0.23` (the
`wasm-opt` / `wat2wasm` / `wasm2wat` binaries).*

### binaryen 98.0.0 — Apache-2.0
WebAssembly optimizer/codegen (`wasm-opt`), binaryen.js build.
```
Copyright The AssemblyScript Authors / The Binaryen Authors (WebAssembly Community Group).
Licensed under the Apache License, Version 2.0.
```
Source: https://github.com/AssemblyScript/binaryen.js (port of https://github.com/WebAssembly/binaryen)
*The shipped package contains the bare Apache-2.0 licence text with an unfilled
copyright placeholder and no NOTICE file; the attribution above is the factual
upstream credit.*

### wabt 1.0.23 — Apache-2.0 (bundled under wat-wasm)
```
Copyright 2015 the repository authors, see AUTHORS file.
```
Source: https://github.com/AssemblyScript/wabt.js

---

## 3. Build & CLI support (transitive)

These are transitive dependencies of the components above (argon2's native build
chain, the `cross-env` / `cross-spawn` process helpers, and the `chalk` terminal-
styling stack). All are MIT except the two ISC packages noted.

### node-addon-api 8.8.0 — MIT
```
Copyright (c) 2017 Node.js API collaborators
```
Source: https://github.com/nodejs/node-addon-api

### node-gyp-build 4.8.4 — MIT
```
Copyright (c) 2017 Mathias Buus
```
Source: https://github.com/prebuild/node-gyp-build

### cross-env 10.1.0 — MIT
```
Copyright (c) 2017-2025 Kent C. Dodds
```
Source: https://github.com/kentcdodds/cross-env

### cross-spawn 7.0.6 — MIT
```
Copyright (c) 2018 Made With MOXY Lda <hello@moxy.studio>
```
Source: https://github.com/moxystudio/node-cross-spawn

### which 2.0.2 — ISC
```
Copyright (c) Isaac Z. Schlueter and Contributors
```
Source: https://github.com/isaacs/node-which

### isexe 2.0.0 — ISC
```
Copyright (c) Isaac Z. Schlueter and Contributors
```
Source: https://github.com/isaacs/isexe

### path-key 3.1.1 — MIT
```
Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (sindresorhus.com)
```
Source: https://github.com/sindresorhus/path-key

### shebang-command 2.0.0 — MIT
```
Copyright (c) Kevin Mårtensson <kevinmartensson@gmail.com> (github.com/kevva)
```
Source: https://github.com/kevva/shebang-command

### shebang-regex 3.0.0 — MIT
```
Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (sindresorhus.com)
```
Source: https://github.com/sindresorhus/shebang-regex

### chalk 3.0.0 — MIT
```
Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (sindresorhus.com)
```
Source: https://github.com/chalk/chalk

### ansi-styles 4.3.0 — MIT
```
Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (sindresorhus.com)
```
Source: https://github.com/chalk/ansi-styles

### supports-color 7.2.0 — MIT
```
Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (sindresorhus.com)
```
Source: https://github.com/chalk/supports-color

### has-flag 4.0.0 — MIT
```
Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (sindresorhus.com)
```
Source: https://github.com/sindresorhus/has-flag

### color-convert 2.0.1 — MIT
```
Copyright (c) 2011-2016 Heather Arthur <fayearthur@gmail.com>
```
Source: https://github.com/Qix-/color-convert

### color-name 1.1.4 — MIT
```
Copyright (c) 2015 Dmitry Ivanov
```
Source: https://github.com/colorjs/color-name

### @epic-web/invariant 1.0.0 — MIT
```
Copyright (c) Kent C. Dodds (https://kentcdodds.com)
```
Source: https://github.com/epicweb-dev/invariant

### typescript 5.9.3 — Apache-2.0 *(build-time / dev dependency — not shipped)*
```
Copyright (c) Microsoft Corporation. All rights reserved.
```
Source: https://github.com/microsoft/TypeScript

---

## 4. Bundled subcomponents

### Bundled in `argon2` 0.44.0

#### phc-winner-argon2 — C reference implementation
Dual-licensed **CC0-1.0 OR Apache-2.0**, at the licensee's option
(shipped at `node_modules/argon2/argon2/LICENSE`).
```
Argon2 reference source code package - reference C implementations

Copyright 2015
Daniel Dinu, Dmitry Khovratovich, Jean-Philippe Aumasson, and Samuel Neves
```
Source: https://github.com/P-H-C/phc-winner-argon2

For Galerina, the **Apache-2.0 option** is elected for this subcomponent, in order
to obtain the express patent grant of Apache-2.0 §3 (CC0-1.0 §4(a) expressly does
**not** waive patent rights). The Apache-2.0 licence text below therefore also
governs this subcomponent.

#### BLAKE2 hash implementation
Bundled within phc-winner-argon2 under the same **CC0-1.0 OR Apache-2.0** dual
grant; covered by the same copyright notice and the Apache-2.0 election above.
Files reside in `node_modules/argon2/argon2/src/blake2/`.

### Provenance note (not redistributed in the npm tarball)

#### FP16 — MIT
The upstream WebAssembly/binaryen source bundles FP16 (MIT). The npm `binaryen`
package ships only compiled `wasm-opt` output, not FP16's source, so no separate
MIT notice is strictly required — it is recorded here for provenance.
```
Copyright (c) Marat Dukhan
```
Source: https://github.com/Maratyszcza/FP16

---

# Licence texts

## MIT License

```
MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## ISC License

```
ISC License

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```

## BSD-3-Clause License

```
Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its contributors
   may be used to endorse or promote products derived from this software
   without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

## Apache License 2.0

```
                                 Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work
      (an example is provided in the Appendix below).

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to Licensor for inclusion in the Work by the copyright owner
      or by an individual or Legal Entity authorized to submit on behalf of
      the copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control systems,
      and issue tracking systems that are managed by, or on behalf of, the
      Licensor for the purpose of discussing and improving the Work, but
      excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted. If You
      institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the Work
      or a Contribution incorporated within the Work constitutes direct
      or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate
      as of the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works, in at least one
          of the following places: within a NOTICE text file distributed
          as part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and
          do not modify the License. You may add Your own attribution
          notices within Derivative Works that You distribute, alongside
          or as an addendum to the NOTICE text from the Work, provided
          that such additional attribution notices cannot be construed
          as modifying the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions
      for use, reproduction, or distribution of Your modifications, or
      for any such Derivative Works as a whole, provided Your use,
      reproduction, and distribution of the Work otherwise complies with
      the conditions stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Additional Liability. While redistributing
      the Work or Derivative Works thereof, You may choose to offer,
      and charge a fee for, acceptance of support, warranty, indemnity,
      or other liability obligations and/or rights consistent with this
      License. However, in accepting such obligations, You may act only
      on Your own behalf and on Your sole responsibility, not on behalf
      of any other Contributor, and only if You agree to indemnify,
      defend, and hold each Contributor harmless for any liability
      incurred by, or claims asserted against, such Contributor by reason
      of your accepting any such warranty or additional liability.

   END OF TERMS AND CONDITIONS

   APPENDIX: How to apply the Apache License to your work.

      To apply the Apache License to your work, attach the following
      boilerplate notice, with the fields enclosed by brackets "[]"
      replaced with your own identifying information. (Don't include
      the brackets!)  The text should be enclosed in the appropriate
      comment syntax for the file format. We also recommend that a
      file or class name and description of purpose be included on the
      same "printed page" as the copyright notice for easier
      identification within third-party archives.

   Copyright [yyyy] [name of copyright owner]

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
```

## CC0 1.0 Universal (referenced for the phc-winner-argon2 subcomponent)

The bundled phc-winner-argon2 C reference implementation (and its bundled BLAKE2
code) is offered as **CC0-1.0 OR Apache-2.0**. Galerina elects the **Apache-2.0**
option (reproduced above), which provides an express patent grant. The CC0-1.0
alternative — a public-domain dedication — remains available to downstream
recipients at their option; its full text is at
https://creativecommons.org/publicdomain/zero/1.0/legalcode.

---

*End of Third-Party Notices.*
