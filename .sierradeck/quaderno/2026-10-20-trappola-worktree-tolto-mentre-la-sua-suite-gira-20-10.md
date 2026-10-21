---
titolo: "Trappola: worktree tolto mentre la sua suite gira (20/10)"
quando: 2026-10-20T18:34:21.640Z
tag: ["autopilota"]
---

Il programma toglie il worktree di una chat appena unisce il suo ramo in main. Se in quella copia gira ancora una suite vitest, decine di file falliscono con «Cannot find module '/@id/…'» e 0 test: sembra un test appeso, ma non lo è (c-25, 129 file). Le misure dei test vanno fatte su main o in una copia che non verrà unita durante il giro. Il 20/10 sera, sul main della 0.81.1, c-324 ha misurato tests/main tutto verde in 290 s (190 file, 1809 test) e le altre suite tutte verdi in 390 s (251 file, 2736 test).
