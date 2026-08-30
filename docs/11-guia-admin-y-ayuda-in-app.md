# 11 · Guía de Admin y Ayuda dentro del Producto

Dos cosas viven acá: (1) cómo el software se explica solo a quien entra, y (2) tu manual de admin para entender todo el sistema.

## Parte A · Ayuda dentro del producto (para cualquiera que ingresa)
El objetivo: que un creador o una empresa-cliente entienda cada pantalla sin manual externo.

1. **Tour de bienvenida por rol** (primer ingreso): 3–5 pasos con tooltips, textos distintos para Creador / Empresa-cliente / Superadmin.
2. **Panel "¿Qué es esto?"** en cada pantalla: un ícono (i) abre un drawer que explica qué es, qué puedes hacer y 2–3 tips, en español simple.
3. **Microcopy inline**: cada tarjeta, nodo, sub-tarea y campo lleva una descripción de 1 línea en palabras del dueño (no técnicas).
4. **Estados vacíos que enseñan**: ningún vacío en blanco; cada uno explica la sección y da un CTA.
5. **Centro de Ayuda** (pantalla propia): buscador + categorías + artículos con GIF cortos.

El detalle visual de todo esto está en el prompt de diseño (`prompts/claude-design-prompt.md`, GRUPO F).

## Parte B · Manual de Admin (para ti, el dueño/Superadmin)
Pensado para que entiendas el software completo de un vistazo. Vive dentro de la Consola de Superadmin, sección "Cómo funciona Kaudal".

### B1. El sistema en una frase
Kaudal es una **fábrica de agentes**: un creador arma un agente (cualquiera), y los **subagentes del sistema** lo venden, lo cobran, le hacen marketing, lo revisan y lo despliegan hasta dejarlo operando solo para una empresa-cliente. Ver `docs/12-subagentes-del-sistema.md`.

### B2. Quién es quién
- **Tú (Superadmin):** dueño de la plataforma. Ves todo. Gratis.
- **Creador:** paga suscripción; arma y opera agentes para sus empresas-cliente.
- **Empresa-cliente:** recibe cuenta creada por el creador; solo ve su agente y pone reclamos.
- **Consumidor final:** le escribe al agente por WhatsApp/canal; no tiene cuenta.

### B3. El flujo de una plata (doble cobro)
1. El creador te paga a TI (suscripción + consumo) → ingreso de Kaudal (MRR).
2. El creador le cobra a SU empresa-cliente por el agente → ingreso del creador.
Ambos flujos son visibles en la plataforma.

### B4. Los módulos (qué hace cada uno, dónde vive)
| Módulo | Qué hace | Dónde vive |
|---|---|---|
| Constructor (Canvas) | Arma cualquier agente sin código | Frontend Next.js + Mastra |
| Motor de agentes | Ejecuta agentes y workflows | Backend NestJS + Mastra |
| Subagentes del sistema | Venden, cobran, marketing, despliegan, revisan | Backend (ver doc 12) |
| Pipeline e2e | Lleva un agente de creado a vivo | Backend + UI (C3) |
| Cobros | Doble cobro (Kaudal↔creador, creador↔cliente) | NestJS + pasarela de pago |
| Portal del cliente | Vista simple del agente + reclamos | Frontend |
| Consola Superadmin | Torre de control (tú) | Frontend + NestJS |
| Auditoría | Bitácora de todo | Postgres |

### B5. "Salud en palabras"
La consola traduce lo técnico a frases: "Todo operando normal", "Hay 2 despliegues en cola", "Un creador cerca de su límite de consumo". Tú no necesitas leer logs para saber cómo va.

### B6. Glosario
- **Creador:** cliente que paga y arma agentes.
- **Empresa-cliente:** a quién el creador le vende el agente.
- **Agente:** IA que razona y actúa en un dominio.
- **Workflow:** el flujo visual de nodos que ejecuta el agente.
- **Umbral de confianza:** cuándo el agente resuelve solo vs. deriva a humano.
- **Despliegue e2e:** el trámite completo de dejar un agente vivo (marca, cobro, canal, revisión, deploy).
- **Subagente del sistema:** agente interno de Kaudal que automatiza ese trámite.
