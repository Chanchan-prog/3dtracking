<#
PowerShell helper to create a Windows Scheduled Task that runs the weekly attendance generator.

Usage:
  - Open PowerShell "Run as Administrator"
  - cd to this project folder or run the script directly:
      & 'C:\xampp\htdocs\3D-School-Attendance\server-php\scripts\create_schtasks.ps1'

What it does:
  - Verifies the PHP executable and the CLI generator script exist.
  - Runs schtasks to create a weekly task named "3DSchool_GenerateAttendance" that runs every Monday at 03:00.

Adjust paths below if your PHP or project is installed in a different location.
#>

# CONFIG — update these if your installation differs
$taskName = '3DSchool_GenerateAttendance'
$phpExe = 'C:\xampp\php\php.exe'
$script = 'C:\xampp\htdocs\3D-School-Attendance\server-php\scripts\generate-weekly-attendance.php'
$startTime = '03:00'   # 24-hour format HH:mm
$day = 'MON'           # Day of week for weekly schedule

Write-Host "Scheduled task: $taskName"
Write-Host "PHP executable: $phpExe"
Write-Host "Generator script: $script"
Write-Host "Schedule: Weekly on $day at $startTime"

if (-not (Test-Path $phpExe)) {
    Write-Host "ERROR: PHP executable not found at $phpExe. Update the path in this script and re-run." -ForegroundColor Red
    exit 1
}
if (-not (Test-Path $script)) {
    Write-Host "ERROR: Generator script not found at $script. Ensure the repo is in the expected location." -ForegroundColor Red
    exit 1
}

# Build the action string and the schtasks arguments. Use quoting suitable for schtasks.
$action = "`"$phpExe`" `"$script`""
$arguments = "/Create /SC WEEKLY /D $day /TN `"$taskName`" /TR `"$action`" /ST $startTime /F"

Write-Host "About to run: schtasks $arguments"

# Attempt to create the task. This requires elevated privileges.
try {
    $proc = Start-Process -FilePath schtasks -ArgumentList $arguments -NoNewWindow -Wait -PassThru -ErrorAction Stop
    if ($proc.ExitCode -eq 0) {
        Write-Host "Scheduled task created successfully: $taskName" -ForegroundColor Green
    } else {
        Write-Host "schtasks exited with code $($proc.ExitCode)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "Failed to create scheduled task. Please run this script as Administrator." -ForegroundColor Red
    Write-Host "Error: $_"
    exit 2
}
