# Runbook actualizado: Railway, proveedores y primer cliente

> Estado al 2026-08-31: esta guía describe el camino para llevar Kaudal a producción. No significa que Flow, DTE, Railway API ni emails ya estén conectados en el código. Esos cuatro bloques son **NO-GO** hasta implementarlos y verificarlos en staging.

## 0. Arquitectura real de Kaudal

```text
Cliente ──paga plan──> Flow ──liquida saldo──> cuenta bancaria del operador
Cliente ──usa su key──> Anthropic / OpenAI
                                    ↑
Workflow n8n / código del agente ──uso y estado──> Kaudal (Next.js en Railway)
                                                      │
                                            Supabase (Auth + Postgres + Storage)
                                                      │
                                  Railway/VPS (instancia del agente, tras pago)
```

- **Kaudal:** una app Next.js desplegada desde `app/`. Es panel, portal, cobros, soporte y control; no es el motor del agente.
- **Supabase Cloud:** Auth, Postgres, RLS y Storage. No instalar Postgres adicional en Railway para Kaudal.
- **n8n / workflow:** vive como servicio separado por cliente cuando sea necesario. Usa la API key del cliente y reporta uso a Kaudal.
- **Flow:** recauda el precio mensual del plan del operador. Descuenta su comisión y liquida el saldo a la cuenta bancaria del comercio; Kaudal no divide ni mueve dinero entre cuentas.
- **Email:** proveedor transaccional por conectar (se recomienda Resend para el primer despliegue). Flow puede enviar sus propios comprobantes, pero Kaudal debe enviar sus avisos operativos.

## 1. Decisión antes de gastar

El cliente debe aportar dos cosas distintas:

| Elemento | Quién lo entrega/paga | Para qué sirve |
|---|---|---|
| API key de IA | Cliente | Paga tokens directamente al proveedor de IA. |
| Plan mensual | Cliente, a Flow | Paga tu infraestructura, soporte, gestión y margen. |

El operador debe tener una tarjeta o reserva pequeña para Railway/VPS. Flow confirma un pago antes de que el abono llegue al banco; no crear una instancia dedicada si el pago aún no está confirmado. El precio del plan debe cubrir `infraestructura + soporte + comisión Flow + margen + IVA según corresponda`.

## 2. Cuentas y secretos que debes tener

No pegar ninguno en el chat, commits, tickets ni screenshots. Se crean como secretos en Railway.

| Servicio | Crear/configurar | Secreto o dato que usarás |
|---|---|---|
| GitHub | Repo `raulduha/Kaudal` | Acceso para conectar Railway. |
| Railway | Proyecto de staging y luego producción | Token solo si se automatiza con API/CLI. |
| Supabase Cloud | Proyecto separado para staging y producción | URL, publishable/anon key, service role, DB URL para migraciones. |
| Flow | Comercio validado y sandbox primero | Credenciales/API y secreto de firma del webhook oficial. |
| DTE | Proveedor elegido y emisor habilitado | Token/certificado según proveedor. |
| Resend (o similar) | Dominio remitente verificado | API key de envío. |
| Dominio | `app.tudominio.cl` y, opcionalmente, `n8n-cliente.tudominio.cl` | DNS para Railway y remitente de correo. |

### Variables vigentes de Kaudal

Configúralas por ambiente en Railway; las marcadas secretas no empiezan con `NEXT_PUBLIC_`.

```dotenv
NODE_ENV=production
NEXT_PUBLIC_SITE_URL=https://app.tudominio.cl
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable-key>
SUPABASE_SERVICE_ROLE_KEY=<secret>
SUPABASE_DB_URL=<connection-string-para-migraciones>

KAUDAL_KEY_VERSION_ACTUAL=1
KAUDAL_MASTER_KEY_V1=<base64-de-32-bytes>

# Sandbox actual; reemplazar por las variables del adaptador Flow real al implementarlo.
FLOW_SANDBOX_WEBHOOK_SECRET=<secreto-hmac-aleatorio>
SUSPENSION_CRON_SECRET=<secreto-hmac-distinto>
```

Genera la clave maestra con `openssl rand -base64 32`. Nunca reemplaces ni pierdas `KAUDAL_MASTER_KEY_V1`: las API keys existentes no podrán descifrarse. La rotación se hace agregando `KAUDAL_MASTER_KEY_V2`, cambiando `KAUDAL_KEY_VERSION_ACTUAL=2`, re-cifrando y manteniendo V1 hasta terminar.

## 3. Preparar Supabase Cloud

1. Crea **dos** proyectos: `kaudal-staging` y `kaudal-production`; no reutilices el Supabase local.
2. En cada proyecto, guarda URL y keys desde Connect/API.
3. Configura Auth: `Site URL` con el dominio del ambiente y agrega `https://app.tudominio.cl/invitacion` y las rutas de recuperación que use la app como Redirect URLs.
4. Desactiva el registro abierto. Kaudal crea usuarios por invitación del operador; no habilitar signup público.
5. Activa MFA para las cuentas administradoras de Supabase.
6. Aplica migraciones desde una máquina autorizada o CI, nunca desde la app web:

```powershell
supabase login
supabase link --project-ref <project-ref>
supabase db push
```

7. Confirma con pruebas que RLS sigue aislando cliente A de cliente B y que el `service_role` no sale de Railway.
8. Configura el email de invitación/recuperación en Supabase o su hook de envío antes de invitar clientes reales.

Supabase mantiene configuración y migraciones por ambiente; revisa diferencias antes de hacer `db push`. [Guía oficial de configuración como código](https://supabase.com/blog/cli-v2-config-as-code).

## 4. Desplegar Kaudal en Railway

Esta app tiene Dockerfile y `output: "standalone"`. Railway debe construir desde `app/`, no desde la raíz del repo.

1. En Railway crea un proyecto llamado `kaudal-staging`.
2. **New → GitHub Repo**, selecciona `raulduha/Kaudal` y la rama de staging. Railway construye automáticamente al detectar un Dockerfile. [Servicios Railway](https://docs.railway.com/services)
3. En el servicio, configura **Root Directory**: `app`. Verifica que el Dockerfile usado sea `app/Dockerfile`.
4. En **Variables**, agrega todas las variables de la sección 2. Copia valores; no subas `.env.local`.
5. En **Networking**, genera el dominio Railway temporal y prueba `/login`. Luego agrega `app.tudominio.cl` y crea el CNAME que Railway indique.
6. Revisa logs de build y runtime. Debe terminar con la app escuchando en el `PORT` entregado por Railway.
7. Ejecuta login de operador, login de cliente, carga de key en staging y crea un ticket de prueba.
8. Solo cuando staging pase, repite el proyecto para `kaudal-production` usando la rama `main` y sus propios secretos/Supabase.

Railway no ejecuta `docker-compose.yml` completo: cada servicio es independiente y las dependencias se conectan por variables/referencias. En Kaudal actual basta un servicio web y Supabase externo. [Mapeo oficial de Compose a Railway](https://docs.railway.com/guides/docker-compose).

## 5. Cron de morosidad

En sandbox existe `POST /api/internal/suspender-morosos`, protegido por HMAC. Para operar de verdad:

1. Implementa primero la suspensión real del proveedor de infraestructura; hoy el endpoint solo cambia estado en base de datos.
2. Crea un Scheduled Job de Railway que invoque el endpoint cada día con la firma calculada usando `SUSPENSION_CRON_SECRET`, o usa un proveedor de cron externo equivalente.
3. El job debe ser idempotente, registrar resultados y alertar si falla.
4. Prueba en staging con una suscripción vencida y una instancia desechable.

Railway soporta servicios programados que se ejecutan hasta terminar. [Documentación de servicios programados](https://docs.railway.com/services).

## 6. Flow real y DTE: orden de integración

No cambies el endpoint sandbox por intuición. Implementa un adaptador Flow real separado, con pruebas y validación de estado en servidor.

1. Abre y valida la cuenta comercial Flow; configura cuenta bancaria de liquidación a nombre del comercio.
2. Parte en sandbox y configura URL de webhook HTTPS de staging.
3. Al iniciar un cobro, guarda una orden interna con idempotency key y estado `pendiente`.
4. Al llegar el webhook, verifica la firma y consulta el estado oficial de la orden en Flow antes de marcarla pagada.
5. Dentro de una transacción, registra cobro, activa suscripción y encola provisión. Un mismo webhook no puede activar dos veces.
6. Solo después del pago confirmado, provisiona/reactiva la instancia real.
7. Emite DTE después de confirmar el cobro, mediante un proveedor tributario habilitado; guarda folio, URL y estado. No afirmar que hay boleta si el proveedor falló.
8. Prueba: pagado, rechazado, anulado, webhook duplicado, demora del proveedor y reembolso.

Flow informa al comercio los pagos y sus liquidaciones; su plazo de depósito depende de la tarifa contratada. Consulta el estado exacto en el portal de Flow, no lo infieras desde un redirect del navegador. [Ayuda oficial de Flow](https://web.flow.cl/es-cl/ayuda/).

## 7. Correos necesarios

Conecta un proveedor transaccional antes de abrir producción. Para Resend:

1. Crea el proyecto y verifica `tudominio.cl` agregando sus registros DNS.
2. Guarda su API key como `RESEND_API_KEY` solo en Railway.
3. Implementa una cola/outbox de notificaciones con clave única por `evento + suscripcion/cobro`; así un retry no manda correos duplicados.
4. Envía estos eventos:
   - invitación y primer acceso;
   - pago confirmado y comprobante/enlace al documento;
   - recordatorio previo al vencimiento;
   - pago fallido e inicio de gracia;
   - suspensión y reactivación;
   - respuesta de ticket.
5. Prueba primero contra una dirección interna y registra `message_id`, estado y error sin guardar claves ni contenido sensible innecesario.

La verificación de dominio y uso de API keys se realiza desde el panel/documentación del proveedor; para Resend, usa su [documentación oficial](https://resend.com/docs).

## 8. Provisión de agentes/n8n por cliente

Esto sigue pendiente en Kaudal. Mientras no exista, despliega el workflow manualmente y regístralo en Kaudal.

Flujo futuro seguro:

1. Pago Flow confirmado.
2. Kaudal crea proyecto/servicio n8n en Railway desde una plantilla limpia y con almacenamiento persistente.
3. Kaudal asigna URL, `N8N_ENCRYPTION_KEY` única por instancia, credenciales de base y secreto de ingest de Kaudal.
4. El operador carga/configura los workflows propios de ese cliente.
5. El cliente agrega su API key desde el portal; se guarda cifrada en Kaudal y se inyecta de manera server-side solo en la instancia correcta.
6. El workflow reporta uso mediante su ingest token; nunca expone el secreto al navegador.
7. Impago vencido: se detiene la instancia real; pago confirmado: se reactiva.

No uses una misma `N8N_ENCRYPTION_KEY` entre clientes. Revisa las variables y credenciales propias de n8n antes de automatizar esta fase. [Documentación de configuración de n8n](https://docs.n8n.io/hosting/configuration/environment-variables/).

## 9. Onboarding del cliente: lo que necesita y lo que ve

### Lo que le pides al cliente

1. Razón social, RUT, giro, contacto y correo para su invitación.
2. El proveedor de IA que usará y su API key. Explícale que esa key paga los tokens a su proveedor, no a Kaudal.
3. Aprobación del plan mensual, condiciones de soporte, política de datos y canal del agente.
4. Datos de facturación y pago del plan.
5. Prueba real del canal: un mensaje de WhatsApp, formulario o documento según el agente.

### Lo que nunca le pides ni muestras

- Contraseñas de Railway, Supabase, Flow o n8n.
- Token de ingest, endpoints internos, service role o claves de otros clientes.
- Workflow, prompts o credenciales técnicas de otro cliente.

### Guion de primera entrega

1. Envías invitación a `https://app.tudominio.cl/invitacion`.
2. Cliente define contraseña y entra al portal.
3. Cliente agrega su API key; ve solo que quedó guardada y enmascarada.
4. Cliente completa el primer pago.
5. Tras confirmación, recibe correo “Servicio activado” y prueba su agente.
6. Cliente revisa Uso y costo, Estado de cuenta y Dudas y reclamos.
7. Si necesita ayuda, abre un ticket; el operador responde desde Kaudal.

## 10. Checklist GO / NO-GO

No activar el primer cliente real hasta que todo sea sí:

- [ ] Staging usa Supabase, Railway, dominio y secretos distintos de producción.
- [ ] `npm run typecheck`, `npm test` y build limpio pasan desde checkout limpio.
- [ ] RLS de dos clientes se verifica contra Supabase Cloud.
- [ ] Signup público está apagado; invitaciones y recuperación funcionan con dominio real.
- [ ] Key de cliente permanece cifrada, enmascarada y ausente de logs/respuestas.
- [ ] Flow sandbox completo pasa con webhook duplicado y pago fallido.
- [ ] Flow real, DTE y correos están implementados y validados con un cobro de prueba autorizado.
- [ ] Provisión/suspensión real de infraestructura está probada con recurso desechable.
- [ ] Cron, monitoreo, backups y procedimiento de rollback tienen responsable.
- [ ] Revisión de seguridad y accesibilidad de Fase 12 completada.

Si una casilla no está lista, mantener sandbox o staging. No usar datos ni dinero de clientes reales para descubrir fallas de integración.
