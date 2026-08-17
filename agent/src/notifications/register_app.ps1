$ErrorActionPreference = 'SilentlyContinue'

$shortcutDir = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Avantis"
if (!(Test-Path $shortcutDir)) {
    New-Item -ItemType Directory -Path $shortcutDir -Force | Out-Null
}

$shortcutPath = "$shortcutDir\Avantis Support.lnk"
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = "powershell.exe"
$shortcut.Arguments = "-NoProfile -Command Start-Process 'http://localhost:9142'"
$shortcut.Description = "Avantis Hardware Support"
$shortcut.WindowStyle = 7 # Minimized
$shortcut.Save()

# Register in Registry
$regPath = "HKCU:\Software\Classes\AppUserModelId\Avantis.Support"
if (!(Test-Path $regPath)) {
    New-Item -Path $regPath -Force | Out-Null
}
Set-ItemProperty -Path $regPath -Name "DisplayName" -Value "Avantis Support" -Force
Set-ItemProperty -Path $regPath -Name "ShowInSettings" -Value 1 -Type DWord -Force

Write-Output "App Registered Successfully at $shortcutPath"
