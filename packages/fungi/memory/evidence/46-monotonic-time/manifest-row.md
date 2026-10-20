# Manifest row to add

Do not edit memory-fungi.manifest.json in this commit. Folder audit at this base refuses the new paths. Exact audit result is in folder-audit.txt: FOLDER_REFUSED, UNLISTED_DIR evidence/46-monotonic-time, UNLISTED_FILE src/monotonic-time.fungi, UNLISTED_DIR tests/46-monotonic-time. Exit 2.

Proposed manifest unit:

unit: MONOTONIC_TIME
new_fungi: packages/fungi/memory/src/monotonic-time.fungi
rd: RD-1940
obligations: NO_NULL_NAN, EXHAUSTIVE_FAIL_CLOSED, MONOTONIC_TYPED_TIME
status: NEEDS_LANGUAGE

Proposed folder-audit allow entries, for Grok to fold in at consolidation:

src/monotonic-time.fungi
tests/46-monotonic-time/
evidence/46-monotonic-time/
