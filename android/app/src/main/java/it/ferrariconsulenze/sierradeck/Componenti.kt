package it.ferrariconsulenze.sierradeck

import androidx.compose.foundation.BorderStroke
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
    val forma = MaterialTheme.shapes.small
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
fun Serigrafia(testo: String, colore: Color = Banco.accento, modifier: Modifier = Modifier) {
    Text(
        text = testo.uppercase(),
        color = colore,
        fontSize = 11.sp,
        fontWeight = FontWeight.Bold,
        letterSpacing = 1.5.sp,
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
    Surface(
        onClick = onClick,
        color = if (attiva) Banco.accento else Banco.fondo,
        contentColor = if (attiva) Banco.fondo else Banco.testo,
        shape = MaterialTheme.shapes.small,
        border = BorderStroke(1.dp, if (attiva) Banco.accento else Banco.incisione)
    ) {
        Text(
            testo,
            fontSize = 13.sp,
            fontWeight = if (attiva) FontWeight.Bold else FontWeight.Normal,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 7.dp)
        )
    }
}
