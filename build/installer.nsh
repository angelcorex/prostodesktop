; Custom NSIS include for the Prosto installer.
; Default the installation directory to D:\Prosto (the C: drive is often full).
; The user can still change it on the "Choose install location" page.

!macro preInit
  ; Per-user (perMachine=false) default install location.
  SetRegView 64
  WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "D:\Prosto"
  SetRegView 32
  WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "D:\Prosto"
!macroend
