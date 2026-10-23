import { it } from 'vitest'
import { senzaSigle } from '@shared/chat-autopilota'
it('x', () => {
  for (const t of ['La Revisione di c-90 e c-91', 'Chiudi l’autopilota del gestionale del gruppo 3', 'Chiudi tu a mano l’autopilota del gestionale (c-12) del gruppo 3', 'aspetta la chat c-12', 'unito il ramo ap/ap-f1e631f5/c-90 in main', 'c-14: il menu nuovo', 'Il menu nuovo (c-3). Poi i test.', 'Collaudo del gruppo 3: la pagina del telefono', 'Riprendi il lavoro di c-81 sul ramo ap/ap-f1e631f5/c-81', 'La e-mail e il check-in restano', 'c-2 è ferma da 15 minuti', 'Il menu e c-3 insieme', 'Il riquadro (c-14)', 'Le note e-mail di c-3'])
    console.log(JSON.stringify(t), '=>', JSON.stringify(senzaSigle(t)))
})
