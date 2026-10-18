# Arma iagro-panel.tgz con lo necesario para el servidor (sin node_modules, builds, .env ni respaldos con datos).
#   powershell -ExecutionPolicy Bypass -File deploy\empaquetar.ps1
$raiz = Split-Path $PSScriptRoot -Parent
$salida = Join-Path $raiz 'iagro-panel.tgz'
if (Test-Path $salida) { Remove-Item $salida }

tar -czf $salida -C $raiz `
  --exclude='panel/node_modules' --exclude='panel/.next' --exclude='panel/.env' --exclude='panel/.env.local' `
  --exclude='panel/tsconfig.tsbuildinfo' --exclude='deploy/.env' --exclude='*.tgz' `
  panel deploy n8n docs

if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear el paquete' }
"Listo: $salida ($([math]::Round((Get-Item $salida).Length / 1MB, 1)) MB)"
