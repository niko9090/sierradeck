package it.ferrariconsulenze.sierradeck.nucleo

/**
 * La parola di un PC nell'elenco «Computer», con la stessa regola del PC
 * (`src/shared/stato-pc.ts` e `vocabolario-stati-pc.ts`): acceso, spento, in
 * aggiornamento. Il PC manda già la frase scritta con quella regola (`frase`);
 * l'aggiornamento in corso, letto dal battito, ha la precedenza su «spento»
 * (un PC che tace perché si aggiorna non è spento), mai su «acceso».
 */
object StatoPcVista {
    enum class Colore { VERDE, BLU, QUIETO }

    data class Parola(val testo: String, val colore: Colore, val vivo: Boolean)

    fun parola(p: PcRemoto, adesso: Long): Parola {
        if (!p.vivo && p.inAggiornamento(adesso) != null) return Parola(AggiornamentoRemoto.TESTO, Colore.BLU, false)
        val base = p.frase?.takeIf { it.isNotBlank() }
            ?: if (p.vivo) "acceso" else "spento, ultimo segno ${p.battito.take(16).replace('T', ' ')}"
        return Parola(base, if (p.vivo) Colore.VERDE else Colore.QUIETO, p.vivo)
    }
}
