package it.ferrariconsulenze.sierradeck

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.clickable
import androidx.compose.material3.minimumInteractiveComponentSize

/**
 * I due gesti grafici del banco, in un posto solo.
 *
 * `Tessera`: il pannello inciso — fondo chassis, un solco di un pixel (incisione)
 * al posto della cornice tonda, e l'angolo della console. `Serigrafia`:
 * l'etichetta stampata a stencil — maiuscoletto spaziato, piccola, come le scritte
 * sul metallo di uno strumento. Insieme sono ciò che fa sembrare l'app lo stesso
 * oggetto della finestra, invece di un modulo web.
 */

@Composable
fun Tessera(
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit
) {
    // App 2.89.0: la scheda piana, angolo grande e un filo sottile (come il PC 0.95.0).
    val forma = MaterialTheme.shapes.medium
    val bordo = BorderStroke(1.dp, Banco.incisione)
    if (onClick != null) {
        Surface(
            onClick = onClick,
            color = Banco.chassis,
            contentColor = Banco.testo,
            shape = forma,
            border = bordo,
            modifier = modifier
        ) { Column(content = content) }
    } else {
        Surface(
            color = Banco.chassis,
            contentColor = Banco.testo,
            shape = forma,
            border = bordo,
            modifier = modifier
        ) { Column(content = content) }
    }
}

@Composable
fun Serigrafia(testo: String, colore: Color = Banco.testoQuieto, modifier: Modifier = Modifier) {
    // App 2.89.0: un'intestazione di sezione quieta, non più in accento —
    // l'accento resta per «dove sei» e «cosa premere».
    Text(
        text = testo.uppercase(),
        color = colore,
        fontSize = 12.sp,
        fontWeight = FontWeight.SemiBold,
        letterSpacing = 1.sp,
        modifier = modifier
    )
}

/**
 * Una pastiglia: si preme, e quando è quella scelta si vede da lontano.
 *
 * Scelta a pieno accento contro contorno inciso, non due grigi appena diversi —
 * il chip di Material lo diceva troppo piano, e su uno schermo tenuto in mano,
 * di sera, non lo diceva affatto.
 */
@Composable
fun Voce(testo: String, attiva: Boolean, onClick: () -> Unit) {
    // App 2.89.0: la scelta è un fondo d'accento leggero con il bordo d'accento,
    // le altre un contorno sottile: si legge da lontano senza un blocco pieno.
    Surface(
        onClick = onClick,
        color = if (attiva) Banco.accentoTenue else Color.Transparent,
        contentColor = Banco.testo,
        shape = RoundedCornerShape(50),
        border = BorderStroke(1.dp, if (attiva) Banco.accento else Banco.incisione)
    ) {
        Text(
            testo,
            fontSize = 13.sp,
            fontWeight = if (attiva) FontWeight.SemiBold else FontWeight.Normal,
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp)
        )
    }
}

/**
 * Un tocco sempre di almeno 48 dp (0.83.0), come i tasti di Material: le righe
 * e le pastiglie fatte a mano con `clickable` erano alte 28-36 dp, e di sera,
 * col telefono in una mano, si prendeva la riga accanto. Al posto di
 * `clickable`, stessa forma.
 */
fun Modifier.tocco(enabled: Boolean = true, onClick: () -> Unit): Modifier =
    this.clickable(enabled = enabled, onClick = onClick).minimumInteractiveComponentSize()

/**
 * Un segno piccolo dentro una riga di testo (✓ ⋯ di un messaggio): non si
 * allarga a 48 dp, o la riga andrebbe a capo a ogni segno. L'area del tocco
 * la allarga Compose da solo fino a 48 dp, senza spostare il disegno.
 */
fun Modifier.toccoInLinea(onClick: () -> Unit): Modifier = this.clickable(onClick = onClick)
