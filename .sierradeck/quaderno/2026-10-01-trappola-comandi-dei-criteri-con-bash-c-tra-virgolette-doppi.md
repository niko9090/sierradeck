---
titolo: "Trappola: comandi dei criteri con bash -c tra virgolette doppie"
quando: 2026-10-01T15:35:32.246Z
tag: ["autopilota"]
---

01/10: due criteri scritti dal supervisore nel dialogo usavano bash -c "f=...; grep ... $f" oppure node -p dentro bash -c tra virgolette doppie. La shell esterna espande $f (vuoto) o spezza le virgolette, quindi il comando boccia anche quando il lavoro è fatto. La rete di sicurezza (src/autopilot-host/rete-sicurezza.ts) rifiuta giustamente di «correggere» un criterio che boccia, e l'unica uscita resta chiedere a Nicholas. Regola: nei criteri non usare variabili dentro bash -c "...". Scrivere i percorsi per esteso, oppure usare node -e con apici singoli all'interno. Proposta: controllare i comandi dei criteri quando si scrivono (variabili $ dentro bash -c tra virgolette doppie, virgolette sbilanciate) e rifiutarli lì, prima che entrino nel lavoro.
