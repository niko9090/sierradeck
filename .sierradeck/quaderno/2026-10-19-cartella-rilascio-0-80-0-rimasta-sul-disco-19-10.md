---
titolo: "Cartella rilascio-0-80-0 rimasta sul disco (19/10)"
quando: 2026-10-19T16:13:40.377Z
tag: ["autopilota"]
---

`git worktree remove` on SierraDeck.sierradeck-wt/rilascio-0-80-0 stopped with «Filename too long» (gradle build folders). Git no longer tracks it; it only contains copied files and build output for the 0.80.0 (a22c1df). It needs removing with long paths enabled (`git config core.longpaths true` doesn't help after the fact; use `robocopy` with an empty folder /MIR or a tool that supports \\?\ paths), only after checking it's that folder. Don't use it for other builds.
