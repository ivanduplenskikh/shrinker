$ErrorActionPreference = "Stop"

npm run demo

Write-Host ""
Write-Host "Try the real CLI:"
Write-Host "  node dist\src\cli.js exec --metrics -- git status"
Write-Host "  node dist\src\cli.js exec --metrics -- git log -n 10"
Write-Host "  Get-Content .\tests\fixtures\generic-log.txt -Raw | node dist\src\cli.js pipe --metrics --kind log"
