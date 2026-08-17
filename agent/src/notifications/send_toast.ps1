param(
    [string]$AppTitle = "Avantis Support",
    [string]$Title = "Avantis Predictive Care",
    [string]$Message = "System notification",
    [string]$Url = "http://localhost:9142"
)

$ErrorActionPreference = 'SilentlyContinue'

$logoPath = "$PSScriptRoot\avantis_logo.png"
if (!(Test-Path $logoPath)) {
    $logoPath = Resolve-Path "$PSScriptRoot\..\..\..\client-ui\assets\avantis_logo.png" -ErrorAction SilentlyContinue
}
$logoUri = if ($logoPath) { "file:///" + ($logoPath.ToString() -replace '\\', '/') } else { "" }

$safeAppTitle = [System.Security.SecurityElement]::Escape($AppTitle)
$safeTitle = [System.Security.SecurityElement]::Escape($Title)
$safeMessage = [System.Security.SecurityElement]::Escape($Message)

$shown = $false

# Method 1: Modern Windows 10/11 Toast Notification
try {
    [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
    [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null

    $template = @"
<toast activationType="protocol" launch="$Url">
    <visual>
        <binding template="ToastGeneric">
            <image placement="appLogoOverride" hint-crop="circle" src="$logoUri" />
            <text>$safeTitle</text>
            <text>$safeMessage</text>
        </binding>
    </visual>
    <actions>
        <action content="Open Dashboard" activationType="protocol" arguments="$Url" />
        <action content="Dismiss" activationType="system" arguments="dismiss" />
    </actions>
</toast>
"@

    $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
    $xml.LoadXml($template)
    $toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
    
    # Try Avantis.Support, fallback to Windows PowerShell AUMID
    $appIds = @('Avantis.Support', '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe')
    foreach ($appId in $appIds) {
        try {
            $notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId)
            $notifier.Show($toast)
            $shown = $true
            break
        } catch {}
    }
} catch {}

# Method 2: Native Windows System Tray Balloon Notification (Guaranteed visible popup)
if (!$shown) {
    try {
        Add-Type -AssemblyName System.Windows.Forms
        $notify = New-Object System.Windows.Forms.NotifyIcon
        $notify.Icon = [System.Drawing.SystemIcons]::Information
        $notify.BalloonTipTitle = "$Title"
        $notify.BalloonTipText = "$Message"
        $notify.BalloonTipIcon = [System.Windows.Forms.ToolTipIcon]::Info
        $notify.Visible = $True
        $notify.ShowBalloonTip(8000)
        # Keep message pump alive for 2 seconds so Windows displays the balloon
        for ($i = 0; $i -lt 20; $i++) {
            [System.Windows.Forms.Application]::DoEvents()
            Start-Sleep -Milliseconds 100
        }
        $notify.Dispose()
    } catch {}
}
