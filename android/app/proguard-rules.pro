# R8 sull'APK di rilascio (0.83.0): toglie il codice che non si usa e ottimizza
# quello che resta, per un'apertura più svelta.
#
# I nomi però restano quelli veri: gli errori dell'app arrivano al PC
# (ErroriApp, Guasti) con la classe e la pila delle chiamate, e devono potersi
# leggere senza una mappa di traduzione.
-dontobfuscate

# kotlinx.serialization, OkHttp, WorkManager e i servizi Google portano le loro
# regole dentro le librerie: qui non serve ripeterle.
