package it.ferrariconsulenze.sierradeck

/**
 * Dove l'app accetta di parlare in chiaro.
 *
 * La regola sarebbe di `network-security-config`, ma quel file conosce solo
 * nomi di dominio: non c'è modo di scriverci «la rete che comincia per 192.168».
 * Provarci produce eccezioni che non corrispondono a niente — è già successo, e
 * il risultato era un'app che non riusciva ad aprire nessun indirizzo.
 *
 * Quindi la regola sta qui, dove si può dire davvero. È la stessa che il
 * computer applica dall'altra parte per decidere chi lasciar entrare, e le due
 * metà vanno tenute d'accordo.
 */
object Indirizzi {

    /**
     * Le reti da cui si parla senza uscire di casa.
     *
     * Le tre private di sempre, il computer stesso, e **100.64–100.127**, che è
     * lo spazio in cui vivono Tailscale e ZeroTier: da fuori sembra Internet, ma
     * è una rete privata che passa per un tunnel cifrato. Escluderlo significava
     * che chi lavora in VPN non si collegava — ed è metà del motivo per cui
     * questa app esiste.
     */
    fun privato(host: String): Boolean {
        val pezzi = host.split('.')
        if (pezzi.size != 4) {
            // Non è un indirizzo IPv4: `localhost` è l'unico nome che ha senso
            // qui dentro, e vale per chi prova l'app sullo stesso dispositivo.
            return host.equals("localhost", ignoreCase = true)
        }
        val n = pezzi.map { it.toIntOrNull() ?: return false }
        if (n.any { it < 0 || it > 255 }) return false
        val (a, b) = n
        return when {
            a == 10 -> true
            a == 127 -> true
            a == 192 && b == 168 -> true
            a == 172 && b in 16..31 -> true
            a == 169 && b == 254 -> true
            // Lo spazio delle VPN a maglia: Tailscale, ZeroTier.
            a == 100 && b in 64..127 -> true
            else -> false
        }
    }

    /** L'host dentro un indirizzo completo, senza schema e senza porta. */
    fun hostDi(indirizzo: String): String =
        indirizzo
            .substringAfter("://")
            .substringBefore('/')
            .substringBefore(':')

    /**
     * Dice se l'app può aprire quell'indirizzo.
     *
     * Un indirizzo pubblico si rifiuta: ci si parlerebbe in chiaro, attraverso
     * Internet, e non c'è nessuna ragione buona per farlo — il computer di casa
     * non sta lì.
     */
    fun accettabile(indirizzo: String): Boolean = privato(hostDi(indirizzo))
}
