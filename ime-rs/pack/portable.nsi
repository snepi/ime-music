Unicode true
RequestExecutionLevel user
SilentInstall silent
Name "IMe Music"
OutFile "IMe.Music-Portable-1.4.7.1.exe"
InstallDir "$LOCALAPPDATA\IMe Music"

Section
  SetOutPath "$INSTDIR"
  File "IMe Music.exe"
  File "WebView2Loader.dll"
  Exec '"$INSTDIR\IMe Music.exe"'
SectionEnd
