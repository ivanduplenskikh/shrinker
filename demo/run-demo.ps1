$ErrorActionPreference = "Stop"

npm run demo

Write-Host ""
Write-Host "Try the real CLI:"
Write-Host "  node dist\src\cli.js exec -- git status"
Write-Host "  Get-Content .\tests\fixtures\generic-log.txt -Raw | node dist\src\cli.js pipe --kind log"
