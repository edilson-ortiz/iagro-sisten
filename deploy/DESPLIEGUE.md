# Despliegue en el servidor (iagro-server)

Qué se instala: una sola app (contenedor `iagro-panel`) con el sitio (`/`, `/registro`, `/radar/{id}`, `/clima`)
y el panel (`/panel`). Usa la base **trd** del contenedor `postgres` (la misma de n8n). Reemplaza al
contenedor `iagro-web` en el puerto **8080**, que es adonde apunta el túnel de Cloudflare: el túnel no se toca.

Tiempo estimado: 30–45 minutos. El sitio solo se corta los segundos del cambio (paso 7).

---

## 0. Respaldo de la base (obligatorio)

```bash
cd ~/Iagro
sudo docker exec postgres pg_dump -U postgres -d trd -Fc -f /tmp/trd.dump
sudo docker cp postgres:/tmp/trd.dump ~/Iagro/respaldo_trd_$(date +%F_%H%M).dump
ls -lh ~/Iagro/respaldo_trd_*
```

> Si el usuario de la base no es `postgres`, usa el de la credencial **Postgres account** de n8n.
> Para ver las bases: `sudo docker exec postgres psql -U postgres -l`

## 1. Copiar el proyecto al servidor

En tu PC (PowerShell, dentro de la carpeta `ia-clima`):

```powershell
powershell -ExecutionPolicy Bypass -File deploy\empaquetar.ps1
scp iagro-panel.tgz ortiz@iagro-server:~/Iagro/
```

(Si `scp` no encuentra el servidor, usa su IP, o súbelo con el filebrowser del puerto 8200.)

En el servidor:

```bash
mkdir -p ~/Iagro/iagro-panel
tar -xzf ~/Iagro/iagro-panel.tgz -C ~/Iagro/iagro-panel
cd ~/Iagro/iagro-panel/deploy
```

## 2. Configuración (.env)

```bash
cp .env.example .env
openssl rand -hex 32      # copia el resultado para SESSION_SECRET
nano .env
```

Completa `DATABASE_URL` (usuario y contraseña de la credencial Postgres de n8n), `SESSION_SECRET` y
`CHATWOOT_API_TOKEN`. Para el primer arranque deja **`PUERTO=8081`** (prueba sin tocar el sitio actual).

## 3. Migraciones (crea el esquema `bot_clima` y copia los usuarios)

```bash
sudo docker compose run --rm migrar
```

Debe terminar con `✔ Migraciones aplicadas.` (12 migraciones). Si se vuelve a correr dice `Base de datos al día`.

## 4. Primer despliegue: inbox de WhatsApp y prueba gratis desde hoy

```bash
sudo docker exec -i postgres psql -U postgres -d trd < sql/primer-despliegue.sql
```

Pone el inbox de WhatsApp (5) y deja a **todos los clientes en prueba gratis desde hoy**. Si se corre de
nuevo, no reinicia a nadie.

## 5. Administrador del panel

```bash
sudo docker compose run --rm -it migrar node scripts/crear-admin.mjs admin "Edil Serrano"
```

Pide la contraseña (mínimo 10 caracteres).

## 6. Levantar y probar en el puerto 8081

```bash
sudo docker compose up -d --build panel      # la primera vez tarda unos minutos
sudo docker compose logs -f panel            # Ctrl+C para salir; debe decir "Ready"
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8081/          # 200
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8081/radar/40  # 200
```

## 7. Cambiar el sitio al nuevo (puerto 8080)

```bash
sudo docker stop iagro-web
sudo docker update --restart=no iagro-web
sed -i 's/^PUERTO=.*/PUERTO=8080/' .env
sudo docker compose up -d panel
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/          # 200
```

Abre **https://iagro360.xyz** (landing), **https://iagro360.xyz/panel** (entra con el admin del paso 5) y
**https://iagro360.xyz/privacidad.html** (la URL registrada en Meta debe seguir respondiendo).

> ¿El túnel apunta a otro puerto? Revísalo con `sudo cat /etc/cloudflared/config.yml` (o en Cloudflare
> Zero Trust → Tunnels) y pon ese puerto en `PUERTO`.

**Volver atrás** (si algo falla): `sudo docker compose down && sudo docker start iagro-web && sudo docker update --restart=unless-stopped iagro-web`

## 8. n8n (https://n8n.iagro360.xyz)

1. **Bot principal:** abre *Iagro bot (IA clima completo)* → menú ⋯ → *Import from File* → `n8n/iagro-bot.json`
   → **Save**. (Cambios: no responde "Dejar de recibir"/"Activar alertas", solo procesa mensajes entrantes,
   enlace de registro `/registro`.)
2. **Importa, en este orden:** `iagro-enviar-whatsapp.json`, `iagro-alerta-lluvia.json`, `iagro-seguimiento-estados.json`.
   - En *Alerta de lluvia → Enviar WhatsApp* y en *Seguimiento → Confirmar al usuario*: elige el flujo *IAGRO · Enviar WhatsApp*.
   - Revisa que los nodos usen las credenciales **Postgres account** y **Header Auth account**.
   - Activa *Alerta de lluvia* y *Seguimiento de estados*.
3. **Apaga** el flujo viejo de alertas diarias de las 6:00 si existe (mandaría alertas duplicadas).

## 9. Chatwoot → Configuración → Integraciones → Webhooks

| URL | Eventos |
|---|---|
| `https://n8n.iagro360.xyz/webhook/iagro-chatwoot-2f3eed71e6334227` (seguimiento de alertas) | Mensaje creado |
| La URL que muestra el panel en **Difusiones → "Estados al instante"** | Mensaje creado, Mensaje actualizado |

(El webhook del bot principal ya existe; no se toca.)

## 10. Comprobar

- Panel → **Usuarios**: aparecen tus clientes, todos en prueba.
- Registro: abre https://iagro360.xyz/registro, marca un punto, envía el código por WhatsApp → el usuario
  aparece en el panel solo (alta automática).
- Panel → **Alertas de lluvia**: a la hora siguiente se carga la próxima lluvia de cada cliente.
- Panel → **Consumo** → *Sincronizar con Chatwoot*.
- Cuando todo funcione: en n8n desactiva los webhooks viejos `registro-clima` y el del radar (`/client`).

## Actualizar más adelante

```bash
# PC: empaquetar y copiar (paso 1). Servidor:
cd ~/Iagro/iagro-panel && tar -xzf ~/Iagro/iagro-panel.tgz -C .
cd deploy && sudo docker compose run --rm migrar && sudo docker compose up -d --build panel
```

El `.env` del servidor no se pisa (no va en el paquete).
