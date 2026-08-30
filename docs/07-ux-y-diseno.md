# 07 · UX y Diseño — "n8n pero más cool"

La experiencia visual es una ventaja competitiva, no un adorno. El cliente tiene que **entender el valor con los ojos** en segundos. Este documento define el lenguaje visual y las pantallas; el prompt maestro para generarlas está en `prompts/claude-design-prompt.md`.

## 1. Principios de diseño
1. **Claridad radical:** cada pantalla responde una pregunta ("¿qué está haciendo mi agente ahora?").
2. **Vivo, no estático:** los agentes se sienten trabajando (estados animados, pulsos, contadores en vivo).
3. **Oscuro y eléctrico:** lienzo profundo tipo editor de nodos + acentos que brillan (ver tokens en `brand/brand.config.ts`).
4. **Cero jerga:** lenguaje de dueño de PYME, en español de Chile.
5. **Transparencia como estética:** mostrar el "cómo piensa" del agente es parte del diseño (pasos, decisiones, confianza).
6. **Táctil:** todo se puede tocar, arrastrar, expandir. Micro-interacciones cuidadas.

## 2. Lenguaje visual
- **Modo oscuro por defecto** (`#0B0B12`), con opción clara.
- **Acento primario:** violeta eléctrico `#7C5CFF`. **Éxito/vivo:** menta `#00E0B8`. **Alerta cálida:** naranjo `#FF7A45`.
- **Tipografía:** Geist/Inter (display y texto), Geist Mono para datos técnicos.
- **Bordes suaves** (12–16px), sombras sutiles con glow del acento en elementos activos.
- **Estados de agente/nodo con color** (de `statusColors`): En espera, Trabajando, Ha terminado, Ya trabajando, Actualizado, Con problema. *(Estos estados están inspirados en el feed de actividad que ya viste: "Naming marketing — actualizado", "Brand clearance — ya trabajando", "Social card — ha terminado", "Deployment monitor — ha terminado".)*
- **Glassmorphism sutil** en paneles flotantes; nada recargado.

## 3. Pantallas principales

### 3.1 Landing pública
Hero con el canvas de agentes vivo de fondo (animado), propuesta de valor en una frase, prueba social, precios (de `docs/05`), y CTA "Arma tu primer agente". Debe transmitir "hay valor y es serio".

### 3.2 Dashboard / Home del dueño
- **Tarjetas de KPI en vivo:** conversaciones hoy, resueltas por IA, casos en revisión, cobros gestionados.
- **"Mis agentes":** grilla de tarjetas, cada una con avatar, nombre, estado animado (Trabajando/En espera) y un mini-sparkline de actividad.
- **Feed de actividad** en tiempo real (estilo el que viste): "Agente de Cobranza — ha terminado 12 recordatorios", con chips de estado de colores.

### 3.3 Canvas de workflows (la estrella, "n8n pero más cool")
- Lienzo pan/zoom con **nodos redondeados** conectados por **cables curvos animados** (flujo de partículas cuando está activo).
- Tipos de nodo: **Disparador** (WhatsApp/web), **Agente**, **Herramienta**, **Condición**, **Revisión humana**, **Acción** (responder, cobrar, agendar).
- Cada nodo muestra su **estado en vivo** con color y un pulso cuando procesa.
- Panel lateral de propiedades al seleccionar un nodo (config sin código).
- Minimapa, grilla, snap, deshacer/rehacer. Modo "ver" (para el dueño) y modo "editar".
- **Diferenciador cool:** al pasar una interacción real, se ve el "paquete" viajando por los cables en tiempo real (como ver el trabajo moverse).

### 3.4 Vista de un agente (cuando el cliente entra a ver "su" agente)
- Cabecera con avatar grande, nombre, estado y un toggle Encendido/Apagado.
- **"Cómo piensa":** timeline de los últimos pasos (recibió → clasificó → consultó pedido → decidió → respondió), cada paso con su ícono, tiempo y nivel de confianza.
- **Métricas** del agente (resueltas, derivadas, tiempo medio, satisfacción).
- **Configuración simple:** tono, qué puede y qué no, umbral para derivar a humano — todo con controles visuales.
- Conversaciones recientes, con la traza completa (transparencia).

### 3.5 Bandeja de revisión / Reclamos (muy visual)
- **Columnas tipo kanban** o lista rica: Nuevos → En revisión → Resueltos.
- Cada caso es una **tarjeta hermosa**: cliente, canal (ícono WhatsApp), resumen del agente, nivel de confianza, y sugerencia de respuesta lista para aprobar/editar.
- Un clic para **Aprobar y enviar**, **Editar** o **Escalar**.
- Al abrir, panel con todo el contexto (historial, pedido, adjuntos) sin saltar de pantalla.
- Sensación: "reviso 20 reclamos en 5 minutos y todo se ve ordenado y lindo".

### 3.6 Auditoría
- Línea de tiempo filtrable: quién/qué/cuándo/resultado.
- Exportable. Diseñada para dar tranquilidad ("puedo demostrar todo lo que hizo la IA").

### 3.7 Biblioteca (descargable)
- Galería de **plantillas de agentes y workflows** con preview visual, descripción, y botón **Descargar** (JSON) y **Usar plantilla**. Refuerza transparencia y valor (ver `docs/08`).

## 4. Micro-interacciones y motion
- Nodos que "respiran" al procesar; cables con flujo animado.
- Contadores que suben con easing.
- Transiciones suaves entre pantallas (no cortes secos).
- Estados vacíos con ilustración y un CTA claro (nunca una pantalla en blanco).
- Toasts elegantes para confirmaciones.

## 5. Accesibilidad
- Contraste AA en texto sobre fondo oscuro.
- Foco visible, navegación por teclado en el canvas y formularios.
- No depender solo del color: los estados llevan también ícono/etiqueta.
- Tamaños de toque ≥ 44px.

## 6. Responsive
- Dashboard y bandeja: perfectos en desktop, usables en tablet/móvil (el dueño revisa desde el celular).
- El canvas es desktop-first; en móvil, modo lectura simplificado.

## 7. Componentes clave a construir (design system)
Tarjeta de agente · Nodo de canvas (6 tipos) · Cable animado · Chip de estado · Tarjeta de caso/reclamo · Timeline "cómo piensa" · KPI card con sparkline · Panel de propiedades · Feed de actividad · Galería de plantillas · Toggle encendido/apagado · Toasts.
