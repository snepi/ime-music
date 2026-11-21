Unicode true
RequestExecutionLevel user
Name "IMe Music"
OutFile "IMe.Music-Setup-1.4.7.1.exe"
InstallDir "$LOCALAPPDATA\IMe Music"
InstallDirRegKey HKCU "Software\IMe Music" "InstallDir"

Section "IMe Music"
  SetOutPath "$INSTDIR"
  File "IMe Music.exe"
  File "WebView2Loader.dll"
  CreateShortcut "$DESKTOP\IMe Music.lnk" "$INSTDIR\IMe Music.exe"
  CreateShortcut "$SMPROGRAMS\IMe Music.lnk" "$INSTDIR\IMe Music.exe"
  WriteRegStr HKCU "Software\IMe Music" "InstallDir" "$INSTDIR"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
SectionEnd

Section "Uninstall"
  Delete "$INSTDIR\IMe Music.exe"
  Delete "$INSTDIR\WebView2Loader.dll"
  Delete "$INSTDIR\Uninstall.exe"
  Delete "$DESKTOP\IMe Music.lnk"
  Delete "$SMPROGRAMS\IMe Music.lnk"
  DeleteRegKey HKCU "Software\IMe Music"
  RMDir "$INSTDIR"
SectionEnd
