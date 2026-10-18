#!/usr/bin/env bash
# =====================================================================
# Actualiza IAGRO en el servidor desde GitHub (un solo comando):
#   ~/Iagro/iagro-sistema/deploy/actualizar.sh
# Baja los cambios, reconstruye, aplica migraciones y reinicia el panel.
# El deploy/.env del servidor no se toca (no está en git).
# =====================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

echo "→ Bajando cambios de GitHub"
git pull --ff-only

cd deploy
if [ ! -f .env ]; then
  echo "✖ Falta deploy/.env (copia .env.example como .env y complétalo)"
  exit 1
fi

echo "→ Construyendo (panel y migraciones)"
sudo docker compose build migrar panel

echo "→ Migraciones"
sudo docker compose run --rm migrar

echo "→ Reiniciando el panel"
sudo docker compose up -d panel
sleep 6

PUERTO=$(grep -E '^PUERTO=' .env | cut -d= -f2)
echo "→ Sitio: $(curl -s -o /dev/null -w '%{http_code}' "http://localhost:${PUERTO:-8080}/")  (200 = OK)"
echo "✔ Listo. Si cambiaron flujos de n8n (carpeta n8n/), reimpórtalos en n8n."
