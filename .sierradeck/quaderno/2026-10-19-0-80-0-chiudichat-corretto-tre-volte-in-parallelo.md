---
titolo: "0.80.0: chiudiChat corretto tre volte in parallelo"
quando: 2026-10-19T10:36:51.980Z
tag: ["autopilota"]
---

On 19/10 c-10 (50597e7), c-11 (aafccdb, already in main) and c-12 (4e1a0f3) all fixed chiudiChat for branches that were already merged or missing. Wasted work and conflicts at merge. Rule: before fixing a bug named in the goal, check `git log main` and the other chats' branches (`git log --all --oneline -- <file>`). Only one chat fixes a given bug; the others merge main and keep its version.
