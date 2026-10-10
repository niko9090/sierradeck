; Aggiunte all'installer di electron-builder (0.57.0).
;
; Nella 0.57.0 l'appId, che Windows usa come AppUserModelID, è cambiato.
; L'installer rifà da solo i collegamenti del menu Start e del desktop con quello
; nuovo, ma non tocca il collegamento che l'utente ha fissato sulla barra delle
; applicazioni: resterebbe con quello vecchio, e la finestra aperta comparirebbe
; come un'icona a parte. Qui lo si aggiorna, se c'è.
!macro customInstall
  ${if} ${FileExists} "$APPDATA\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\${SHORTCUT_NAME}.lnk"
    WinShell::SetLnkAUMI "$APPDATA\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\${SHORTCUT_NAME}.lnk" "${APP_ID}"
    System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
  ${endIf}
!macroend
