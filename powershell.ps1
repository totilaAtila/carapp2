# Salvează acest script ca .ps1 și rulează-l ca administrator
function Add-PowerShellToContextMenu {
    $paths = @(
        "Directory\Background\shell\PowerShell",
        "Directory\shell\PowerShell",
        "Drive\shell\PowerShell"
    )
    
    foreach ($path in $paths) {
        $fullPath = "HKLM:\Software\Classes\$path"
        New-Item -Path $fullPath -Force | Out-Null
        Set-ItemProperty -Path $fullPath -Name "(Default)" -Value "PowerShell" -Force
        Set-ItemProperty -Path $fullPath -Name "Icon" -Value "powershell.exe" -Force
        
        $commandPath = "$fullPath\command"
        New-Item -Path $commandPath -Force | Out-Null
        Set-ItemProperty -Path $commandPath -Name "(Default)" -Value "powershell.exe -NoExit -Command `"Set-Location '%V'`"" -Force
    }
    
    Write-Host "PowerShell a fost adăugat în meniul click-dreapta!" -ForegroundColor Green
}

# Rulează funcția (ca administrator)
Add-PowerShellToContextMenu