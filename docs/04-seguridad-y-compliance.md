# 04 · Seguridad y Compliance

Seguridad no es una feature: es la base para que una PYME confíe sus datos y sus clientes a Kaudal. Este documento define los controles mínimos. El subagente `security-auditor` los hace cumplir en cada merge, y `compliance-cl` cubre la parte legal chilena.

## 1. Modelo de amenazas (resumen)
- **Fuga entre empresas (multi-tenant):** que la empresa A vea datos de la B. → El riesgo #1.
- **Robo de secretos:** tokens de WhatsApp, claves de modelos y de pago.
- **Abuso del canal:** spam/inyección por WhatsApp o webhooks falsos.
- **Inyección de prompt:** que un cliente final manipule al agente para filtrar datos o actuar mal.
- **Exposición de archivos:** documentos de clientes accesibles sin permiso.

## 2. Controles técnicos (obligatorios)

### 2.1 Aislamiento multi-tenant
- Cada tabla con datos de cliente lleva `org_id` y **Row Level Security** que filtra por la organización del usuario autenticado.
- Toda consulta pasa por RLS; el `service_role` (que la salta) solo se usa server-side en operaciones controladas.
- Pruebas automáticas que intentan cruzar datos entre orgs y confirman que fallan (`qa-tester`).

### 2.2 Autenticación y autorización
- Auth de Supabase; sesiones con cookies **HTTP-only**, revalidadas server-side.
- Roles: `owner`, `admin`, `operator`, `viewer`. Permisos por rol en cada acción.
- El canal del cliente final está **separado**: nunca accede al dashboard.

### 2.3 Secretos
- `SUPABASE_SERVICE_ROLE_KEY`, tokens Twilio, claves de modelos y pago → solo en variables de entorno del servidor.
- Nada de secretos en el bundle del navegador, en el repo ni en logs.
- Rotación periódica (gestionada por `devops-infra`).

### 2.4 Webhooks
- **Validar la firma** de Twilio/pagos antes de procesar cualquier payload.
- Idempotencia: un mismo evento no se procesa dos veces.
- Rate limiting por origen.

### 2.5 Almacenamiento de archivos
- Buckets **privados**; descargas solo con **URL firmada temporal**.
- Escaneo/validación de tipo y tamaño de los archivos subidos.

### 2.6 Seguridad de los agentes de IA
- Las **tools** de un agente están limitadas al `org_id` activo: no pueden tocar datos de otra empresa.
- **Minimización:** al modelo se le envía solo el dato necesario, nunca la base completa.
- **Salida no confiable:** lo que responde el modelo se valida (Zod) antes de ejecutar acciones.
- **Anti-inyección:** instrucciones del sistema separadas del input del usuario; los datos de terceros se tratan como texto, no como órdenes.
- **Umbral de confianza:** ante duda, el agente deriva a humano en vez de actuar.

### 2.7 Rate limiting y anti-abuso
- Límites por minuto/hora por teléfono, IP y org (persistidos en Postgres/Redis).
- Detección de patrones de abuso y bloqueo temporal.

### 2.8 Auditoría
- `audit_log` **append-only**: quién, qué, cuándo, sobre qué dato, resultado.
- `agent_runs`: traza completa de cada ejecución de agente.
- Responde cualquier "¿qué hizo la IA con este cliente?" — clave para vender confianza y para auditorías.

## 3. Cumplimiento de datos personales (Chile)
Detalle y controles en el subagente `compliance-cl`. Puntos clave:
- **Ley 19.628** (protección de la vida privada) y la nueva **Ley 21.719** (crea la Agencia de Protección de Datos y moderniza el régimen).
- Principios: licitud, finalidad, proporcionalidad/minimización, calidad, seguridad, responsabilidad.
- **Derechos del titular (ARCO+):** acceso, rectificación, cancelación, oposición y portabilidad → el sistema debe permitir consultar, corregir y **eliminar** los datos de un contacto.
- **Consentimiento / opt-in** para el canal de WhatsApp; transparencia (el cliente sabe que habla con un asistente).
- **Encargado de tratamiento:** Kaudal procesa datos por cuenta del cliente → contrato de tratamiento (DPA); el cliente es dueño de sus datos.
- **Retención:** política de plazos y borrado/anonimización.
> La normativa cambia: `compliance-cl` verifica vigencia con búsqueda web y se recomienda revisión de un abogado para lo contractual.

## 4. Buenas prácticas de mensajería y cobranza
- WhatsApp: opt-in, plantillas aprobadas, respetar la ventana de 24h.
- Cobranza: tono respetuoso, horarios razonables, frecuencia acotada; sin hostigamiento.

## 5. Checklist de seguridad para "listo para producción"
- [ ] RLS activo y probado en todas las tablas de cliente.
- [ ] Ningún secreto en el cliente/repo/logs.
- [ ] Webhooks validan firma + idempotencia.
- [ ] Storage privado con URLs firmadas.
- [ ] Tools de agentes limitadas a `org_id`.
- [ ] Rate limiting activo.
- [ ] `audit_log` y `agent_runs` funcionando.
- [ ] Mecanismo de acceso/eliminación de datos del titular.
- [ ] Consentimiento de WhatsApp registrado.
- [ ] `security-auditor` y `compliance-cl` sin hallazgos altos.
