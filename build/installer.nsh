; Zemirot Studio installer — page flow and wording.
;
; This file is picked up automatically by electron-builder (nsis.include
; defaults to build/installer.nsh). It is included before the generated page
; macros run, so the MUI_* definitions below reach the wizard.

!define MUI_WELCOMEPAGE_TITLE "Zemirot Studio ${VERSION}"
!define MUI_WELCOMEPAGE_TITLE_3LINES
!define MUI_WELCOMEPAGE_TEXT "A calm reading room for piyyut: Hebrew song with five transliteration styles, translations, recordings and sources — stored offline on this computer.$\r$\n$\r$\nSetup installs the app for your Windows account. It needs no administrator rights, no account, and no connection."

; The app keeps its library in the user profile, so offer one obvious choice
; instead of a page that asks who the install is for.
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

!macro customWelcomePage
  !insertmacro MUI_PAGE_WELCOME
!macroend

!define MUI_FINISHPAGE_TITLE "Zemirot Studio is ready"
!define MUI_FINISHPAGE_TITLE_3LINES
!define MUI_FINISHPAGE_TEXT "Search the library, switch between transliteration styles, and print a five-reading comparison sheet.$\r$\n$\r$\nYour own songs and settings stay in your Windows profile, even after uninstalling."
!define MUI_FINISHPAGE_RUN_TEXT "Open Zemirot Studio"
