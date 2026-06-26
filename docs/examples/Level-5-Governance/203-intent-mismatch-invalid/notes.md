# 203 — Intent mismatch (invalid)

**Concept:** Intent mismatch when flow behaviour contradicts declared intent

The intent states the flow generates a local report. Sending data to an external endpoint contradicts this intent. SPORE-INTENT-001 is raised when observed behaviour is inconsistent with the declared intent string.

**AI rule:** Flow behaviour must be consistent with declared intent. External calls inconsistent with a local intent trigger SPORE-INTENT-001.
