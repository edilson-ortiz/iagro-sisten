# Flujos de n8n de IAGRO

Todos usan la misma base (`iagro` en el servidor, credencial **Postgres account**) y la misma credencial de Chatwoot
(**Header Auth account**, header `api_access_token`). La configuración (umbrales, horarios, plantillas,
IDs de Chatwoot) se edita en el panel → **Configuración**; los flujos la leen en cada ejecución.

## Flujos activos

| Archivo | Qué hace | Cuándo corre |
|---|---|---|
| `iagro-bot.json` | **Bot principal** (pronóstico, radar, registro con código, lluvias, alertas, fumigar, riego, satélite, feria). Versión oficial: cuando lo cambies en n8n, expórtalo (⋯ → Download) y reemplaza este archivo. Los clientes se leen y se registran en **`bot_clima.usuarios`** (nodos *Buscar Usuario por Teléfono* e *Insertar Nuevo Usuario*); `public.users` ya no se usa. Incluye el **registro por WhatsApp** (sección 9, nodos *Registro: …* e *Invitación: …*): quien no está registrado se registra en el chat con su ubicación 📎, escribiendo su ciudad o con la lista departamento → ciudad; y el botón **📤 Invitar amigos**. | Webhook de Chatwoot (cada mensaje) |
| `iagro-enviar-whatsapp.json` | **Sub-flujo.** Busca o crea el contacto en Chatwoot, lo vincula al inbox de WhatsApp, usa o abre la conversación y envía plantilla o texto. Lo usan los otros dos. | Cuando lo llaman |
| `iagro-alerta-lluvia.json` | Revisa el pronóstico de cada cliente vigente; si llueve en ≤ 24 h y tiene las alertas activas, le envía la plantilla `notificacion_pronostico`. Guarda la próxima lluvia para el panel y desactiva a quien no responde N alertas seguidas. | Cada hora (minuto 5) |
| `iagro-seguimiento-estados.json` | **Arriba:** webhook de Chatwoot → registra las respuestas a las alertas (botón tocado), el botón *Dejar de recibir* (desactiva, lo saca de las difusiones y ofrece **⛈️ Solo lluvias fuertes**) y *ALTA* (vuelve a todo). **Abajo:** cada 10 min consulta entregado/leído de las alertas. | Webhook + cada 10 min |

**Orden para importar:** primero `iagro-enviar-whatsapp`, después los otros dos. En los nodos
*Enviar WhatsApp* (alerta) y *Confirmar al usuario* (seguimiento) elige el flujo *IAGRO · Enviar WhatsApp*.

## Lo que ahora hace el panel (ya no es de n8n)

| Antes (n8n) | Ahora |
|---|---|
| Webhook `registro-clima` (código de registro del sitio) | Panel: `/registro` guarda en `public.user_tmp` |
| Webhook del radar (`/webhook/…/client/{id}`) | Panel: `/radar/{id}` lee la base directo |
| `iagro-difusiones` (difusiones por segmentos) | Panel: módulo **Difusiones** (`/panel/campanas`), con su propio envío y seguimiento |

Cuando el sitio nuevo esté publicado y probado, esos webhooks de n8n se pueden desactivar.

## `_anteriores/` (no importar)

| Archivo | Qué era |
|---|---|
| `n8n-flow.json`, `n8n-flow-actualizado.json` | Copias viejas (7 oct) del **bot principal**. El vigente es el que está en n8n de producción. |
| `n8n-alertas-automaticas.json` | Alertas diarias a las 6:00 (versión anterior). **No activarlo junto con `iagro-alerta-lluvia`: mandaría alertas duplicadas.** |
| `iagro-difusiones.json` | Difusiones por segmentos vía n8n, reemplazado por el módulo del panel. |
