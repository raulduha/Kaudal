# PROMPT MAESTRO PARA CLAUDE DESIGN — Kaudal (modelo final)

> Copia TODO el bloque entre `=====` y pégalo en Claude Design. Está alineado a los specs de `docs/eng/`. Cubre TODAS las pestañas, en modo oscuro moderno, visual, bonito y explicativo simple. No deja nada abierto.

=====================================================================

# QUÉ DISEÑAR
Diseña **Kaudal**, una plataforma web (SaaS) en **español de Chile**, modo oscuro moderno, que toma un agente de IA que YA corre y lo convierte en servicio: lo registra, muestra su uso/costo, cobra y ayuda a desplegar. Estilo: como un editor tipo n8n pero mucho más lindo y simple, para gente NO técnica. Entrega artboards de alta fidelidad (desktop 1440px + móvil 390px de las pantallas clave), listos para desarrollar.

# DOS LADOS (dos experiencias distintas, misma marca)
- **OPERADOR (el dueño, Raúl):** administra todo, inscribe clientes, registra agentes, ve el uso de todos, cobra, y responde reclamos. Acento naranjo #FF7A45 en un badge "Operador".
- **CLIENTE (empresa que el operador inscribe; NO se auto-registra):** portal simple y bonito donde pone su **propia API key**, ve **dónde/cuánto se usa** su agente, **qué modelo** usa, sus **límites** (con aviso al acercarse al tope), y pone **dudas/reclamos**. Acento menta #00E0B8 en un badge "Cliente".
- **Confidencialidad bilateral:** el cliente ve una CAJA NEGRA útil (no ve prompts/código del agente); el operador ve la API key SOLO enmascarada (sk-…AB12), nunca completa.

# COLOR (oscuro por defecto; incluir variante clara)
Fondo #0B0B12 · Superficie #14141F · Elevada #1C1C2B · Borde #2A2A3D · Texto #F4F4FB / #A7A7C0 / #6E6E8A.
Primario #7C5CFF (violeta) hover #6A4AF0 · Éxito/vivo #00E0B8 (menta) · Cálido #FF7A45 (naranjo).
Semánticos: éxito #00E0B8 · advertencia #FFC24B · peligro #FF5C7A · info #5CC8FF.
Estados (chip con punto+etiqueta): En espera #6E6E8A · Trabajando #7C5CFF (pulso) · Ha terminado #00E0B8 · Actualizado #FFC24B · Con problema #FF5C7A.

# TIPOGRAFÍA
Display/UI: **Sora** (fallback Inter). Datos/mono: **JetBrains Mono**. Cuerpo: **Instrument Sans**.
Display 40/48 bold · H1 30/36 · H2 22/28 · H3 18/24 · Cuerpo 15/22 · Small 13/18.

# FORMA / MOTION
Radios: tarjetas 16 · controles 12 · chips 999. Grilla 12 col, espaciado múltiplos de 4. Activos con glow del acento. Glass leve en paneles flotantes. Motion sutil: contadores con easing, estados que "respiran", gráficos que entran suave. Respeta prefers-reduced-motion.

---

# PESTAÑAS A DISEÑAR

## ACCESO
1. **Login** (desktop+móvil): email+contraseña + Google. Dividido: form izq, arte de marca der (gota/onda). Un solo login; el cliente NO tiene registro público.
2. **Bienvenida del cliente** (primer ingreso): "Bienvenido, [Empresa]. Tu agente ya está casi listo." Paso para definir contraseña y luego poner su API key.

## LADO OPERADOR (badge naranjo)
3. **Dashboard operador**: KPIs (clientes activos, agentes vivos/caídos, uso total hoy, ingresos del mes, cobros pendientes, reclamos abiertos) con mini-gráficos. Lista de agentes con estado en vivo. Feed de actividad (chips de estado de color).
4. **Clientes**: tabla (empresa, RUT, agente asignado, estado de cobro, estado). Botón **"Inscribir cliente"** → modal (razón social, RUT, contacto, crear acceso). Deja claro: el cliente NO se registra solo.
5. **Registrar agente**: formulario visual para dar de alta un agente que YA corre (nombre, a qué cliente sirve, endpoint/webhook, modelo que usa, canal). Test de conexión (healthcheck) con resultado visual.
6. **Uso** (operador): uso y costo estimado por cliente y por agente, con gráficos por día. Filtros.
7. **Cobros**: dos bloques — suscripciones por cliente (Flow) y documentos emitidos (boleta/factura DTE). Estado de pago, botón "Generar cobro", comprobantes. CLP + IVA.
8. **Bandeja de reclamos** (operador responde): kanban 3 columnas (Nuevos → En revisión → Resueltos) con tarjetas de ticket (empresa, tipo duda/reclamo, resumen, estado). Al abrir: hilo de mensajes tipo chat + campo para responder.
9. **Config**: llaves del sistema (Flow, DTE), marca por defecto, precios de modelos para la calculadora.

## LADO CLIENTE (badge menta) — portal simple, visual, explicativo
10. **Poner mi API key** (onboarding): pantalla clara y tranquilizadora. Campo para pegar la key (Anthropic/OpenAI), con candado e ícono de "cifrado". Texto simple: "Tu key se guarda cifrada. Nadie la ve, ni nosotros. Solo la usa tu agente." Al guardar, muestra enmascarada (sk-…AB12) y estado válida/inválida.
11. **Inicio del cliente — "Dónde se usa"** (LA pantalla clave): 
    - Tarjetas grandes: **usos este mes**, **costo estimado**, **modelo que usa** (ej: "Claude Sonnet"), y **tu límite** con barra de progreso.
    - **Aviso de límite** visible cuando se acerca al tope: "Vas en el 80% de tu límite mensual — ojo." (chip naranjo/amarillo).
    - Gráfico de uso por día y por agente (área/barras, menta).
    - Todo en lenguaje simple, sin jerga.
12. **Mi agente**: la caja negra útil — avatar, nombre, qué hace en 1 línea, estado (vivo/caído), modelo, y "cómo le está yendo" (resueltas, tiempo). NO muestra prompts ni lógica interna.
13. **Dudas y reclamos** (cliente): botón grande "Tengo una duda / Poner un reclamo" → formulario simple (tipo + mensaje + adjunto). Lista de sus tickets con estado y las respuestas del operador (hilo tipo chat). Vacío: "Todo bien por ahora. Si algo no cuadra, escríbenos acá."

## AYUDA / EXPLICATIVO (que se entienda solo)
14. **Tour de bienvenida** por lado (operador y cliente): 3-4 globos con flecha que explican las zonas. Botones Saltar/Siguiente.
15. **Panel "¿Qué es esto?"**: ícono (i) en cada pantalla que abre un drawer con explicación simple + 2 tips.
16. **Microcopy y vacíos**: cada tarjeta/campo con 1 línea de ayuda; ningún estado en blanco (siempre explica + CTA).

## SISTEMA
17. **Componentes** (artboard suelto): tarjeta de agente · chip de estado (5) · KPI card con sparkline/anillo · tarjeta de cliente (fila de tabla) · tarjeta de ticket · hilo de chat · campo de API key (con candado) · barra de límite con aviso · gráfico de uso · badge de rol (Operador/Cliente) · botones (primario/secundario/fantasma/peligro) · inputs/toggles/sliders · toasts · modal.

---

# COPY (es-CL, tuteo, cero jerga para el cliente)
Botones: "Inscribir cliente", "Registrar agente", "Guardar mi key", "Generar cobro", "Poner un reclamo", "Responder". 
Cliente-friendly: "Dónde se usa", "Tu límite", "Costo estimado", "Tu agente está trabajando". 
Seguridad (tranquilizador): "Tu key se guarda cifrada. Nadie la ve, ni nosotros."
Estados: "trabajando / ha terminado / actualizado / con problema".

# CALIDAD
Contraste AA. Estados con ícono+etiqueta (no solo color). Distingue claramente lado Operador (naranjo) vs Cliente (menta) con badge y acento. Aire generoso. Moderno, vivo, ordenado, elegante — nada recargado. Simple para no-técnicos.

# ENTREGABLES (nombra los artboards)
01-Login, 02-BienvenidaCliente, 03-Op-Dashboard, 04-Op-Clientes, 05-Op-RegistrarAgente, 06-Op-Uso, 07-Op-Cobros, 08-Op-Reclamos, 09-Op-Config, 10-Cli-ApiKey, 11-Cli-Inicio-Uso, 12-Cli-MiAgente, 13-Cli-Reclamos, 14-Tour, 15-QueEsEsto, 16-Componentes (+ -Movil en 03,08,11,13).
Prioriza para empezar: **11-Cli-Inicio-Uso**, **10-Cli-ApiKey**, **03-Op-Dashboard**, **08-Op-Reclamos** (son el corazón).

=====================================================================

## Cómo usar
1. Pega el bloque en Claude Design.
2. Pide primero las 4 prioritarias.
3. Pasa los artboards a Claude Code junto con `docs/eng/05-frontend-operador.md` y `docs/eng/06-portal-cliente.md` para implementarlos.
