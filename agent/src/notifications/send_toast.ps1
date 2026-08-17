param(
    [string]$AppTitle = "Avantis Support",
    [string]$Title = "Hardware Telemetry Alert",
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
    
    # Use registered Avantis.Support AUMID so Windows displays "Avantis Support" in the toast header
    $notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Avantis.Support')
    $notifier.Show($toast)
} catch {
    try {
        Add-Type -AssemblyName System.Windows.Forms
        $notify = New-Object System.Windows.Forms.NotifyIcon
        $notify.Icon = [System.Drawing.SystemIcons]::Information
        $notify.BalloonTipTitle = "${safeAppTitle} - ${safeTitle}"
        $notify.BalloonTipText = $safeMessage
        $notify.Visible = $True
        $notify.ShowBalloonTip(7000)
    } catch {}
}
