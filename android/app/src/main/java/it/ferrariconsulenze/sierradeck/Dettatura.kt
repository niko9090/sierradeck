package it.ferrariconsulenze.sierradeck

/**
 * Il microfono (app 2.75.0, PC 0.75.0). Nicholas, 15/10: «voglio poterti
 * parlare direttamente con il microfono per comunicare qui».
 *
 * La logica, pura, per i test: in che stato è la dettatura e cosa c'è nel
 * campo. Il riconoscimento è quello di Android (SpeechRecognizer, it-IT,
 * offline quando c'è); il testo va nel campo e **lo manda sempre Nicholas**.
 * L'app non registra, non salva e non manda l'audio.
 */
sealed class StatoDettatura {
    object Fermo : StatoDettatura()
    /** Si chiede il permesso del microfono, la prima volta: `base` è il testo che c'era. */
    data class ChiedoPermesso(val base: String) : StatoDettatura()
    data class Ascolto(val base: String, val parziale: String = "") : StatoDettatura()
    data class Errore(val messaggio: String) : StatoDettatura()
    object PermessoNegato : StatoDettatura()
}

sealed class EventoDettatura {
    /** Il tasto 🎤: avvia, o ferma se sta già ascoltando. */
    data class Tasto(val testoNelCampo: String, val haPermesso: Boolean) : EventoDettatura()
    object PermessoDato : EventoDettatura()
    object PermessoNegato : EventoDettatura()
    data class Parziale(val testo: String) : EventoDettatura()
    data class Finale(val testo: String) : EventoDettatura()
    /** Un codice di `SpeechRecognizer.ERROR_*`. */
    data class Errore(val codice: Int) : EventoDettatura()
}

/** Il passo: lo stato nuovo e, se cambia, il testo da mettere nel campo. Non manda mai niente. */
data class PassoDettatura(val stato: StatoDettatura, val campo: String? = null)

object RegolaDettatura {
    const val MOTIVO_PERMESSO = "Per dettare serve il microfono: lo ascolta Android, l'app non registra e non salva l'audio."
    const val SPIEGA = "Tocca 🎤 e parla in italiano: il testo compare nel campo mentre parli. Tocca di nuovo per fermare. " +
        "Non parte niente da solo: lo rileggi e premi tu il tasto per mandare. " +
        "Il riconoscimento è quello di Android (senza rete, se il telefono ha la lingua scaricata). L'app non registra, non salva e non manda l'audio."

    /** Il testo nel campo: quello che c'era, poi il dettato. */
    fun testoNelCampo(base: String, dettato: String): String =
        listOf(base.trimEnd(), dettato.trim().replace(Regex("\\s+"), " ")).filter { it.isNotEmpty() }.joinToString(" ")

    // I codici di android.speech.SpeechRecognizer, ripetuti qui per i test senza Android.
    const val ERRORE_RETE_TEMPO = 1
    const val ERRORE_RETE = 2
    const val ERRORE_AUDIO = 3
    const val ERRORE_SERVER = 4
    const val ERRORE_CLIENT = 5
    const val ERRORE_SILENZIO = 6
    const val ERRORE_NIENTE = 7
    const val ERRORE_OCCUPATO = 8
    const val ERRORE_PERMESSI = 9

    fun messaggio(codice: Int): String = when (codice) {
        ERRORE_SILENZIO, ERRORE_NIENTE -> "Non ho sentito niente: riprova."
        ERRORE_RETE, ERRORE_RETE_TEMPO, ERRORE_SERVER -> "Il riconoscimento ha bisogno della rete (o della lingua italiana scaricata sul telefono)."
        ERRORE_AUDIO -> "Il microfono non risponde."
        ERRORE_OCCUPATO -> "Il riconoscimento è occupato: riprova fra un attimo."
        ERRORE_PERMESSI -> "Manca il permesso del microfono."
        else -> "Dettatura interrotta (errore $codice)."
    }

    fun passo(s: StatoDettatura, e: EventoDettatura): PassoDettatura = when (e) {
        is EventoDettatura.Tasto -> when (s) {
            // Già in ascolto: il tasto ferma; nel campo resta quello che c'è.
            is StatoDettatura.Ascolto -> PassoDettatura(StatoDettatura.Fermo)
            else -> if (e.haPermesso) PassoDettatura(StatoDettatura.Ascolto(e.testoNelCampo)) else PassoDettatura(StatoDettatura.ChiedoPermesso(e.testoNelCampo))
        }
        is EventoDettatura.PermessoDato -> if (s is StatoDettatura.ChiedoPermesso) PassoDettatura(StatoDettatura.Ascolto(s.base)) else PassoDettatura(s)
        is EventoDettatura.PermessoNegato -> PassoDettatura(StatoDettatura.PermessoNegato)
        is EventoDettatura.Parziale -> if (s is StatoDettatura.Ascolto) PassoDettatura(s.copy(parziale = e.testo), testoNelCampo(s.base, e.testo)) else PassoDettatura(s)
        is EventoDettatura.Finale -> if (s is StatoDettatura.Ascolto) PassoDettatura(StatoDettatura.Fermo, testoNelCampo(s.base, e.testo.ifBlank { s.parziale })) else PassoDettatura(s)
        is EventoDettatura.Errore -> if (s is StatoDettatura.Ascolto || s is StatoDettatura.ChiedoPermesso) {
            if (e.codice == ERRORE_PERMESSI) PassoDettatura(StatoDettatura.PermessoNegato) else PassoDettatura(StatoDettatura.Errore(messaggio(e.codice)))
        } else PassoDettatura(s)
    }
}
