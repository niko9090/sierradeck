---
titolo: "Trappola: unione rimandata di un ramo già unito e già tolto"
quando: 2026-10-18T05:50:06.398Z
tag: ["autopilota"]
---

18/10: c-5 è stata unita in main alle 05:32 (def1775) e il ramo ap/ap-f1e631f5/c-5 è stato tolto. Dopo chiudiChat il programma ha ritentato l'unione a ogni turno e ogni volta ha scritto «not something we can merge», risvegliando la chat finita. Quando il commit di punta del ramo è già in main (git merge-base --is-ancestor), l'unione va contata come fatta e non va ritentata.
