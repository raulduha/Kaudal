# 08 · Contenido Descargable (transparencia = valor)

Una de las apuestas de Kaudal: **mostrar cómo trabajan los agentes**, no esconderlo. Cada agente y cada workflow se puede **ver y descargar** como archivo. Esto genera confianza ("no es una caja negra"), enseña, y deja al cliente en control.

## 1. Qué se puede descargar
- **Plantillas de agentes** (`.json`): identidad, instrucciones, herramientas, umbral de confianza, evals.
- **Workflows** (`.json`): nodos y conexiones del canvas (importables a React Flow / Mastra).
- **Guías** (`.md`/`.pdf`): cómo configurar cada agente, buenas prácticas.
- **Reportes** de auditoría y métricas (exportables a CSV/PDF).

## 2. Dónde vive
- En la app: pantalla **Biblioteca** (galería visual con preview + botón Descargar / Usar plantilla).
- En el repo: carpeta `templates/` (agentes y workflows base, versionados y abiertos).

## 3. Formato de una plantilla de agente
Estructura estándar (ver `templates/agents/_plantilla.json` y ejemplos):
```json
{
  "schemaVersion": "1.0",
  "slug": "soporte-cliente",
  "nombre": "Agente de Atención al Cliente",
  "categoria": "atencion",
  "madurez": "probado",
  "descripcion": "Responde consultas frecuentes y estado de pedidos por WhatsApp.",
  "idioma": "es-CL",
  "tono": "cercano, resolutivo, breve",
  "modelo": "claude",
  "instrucciones": "Qué hace y qué NO hace...",
  "herramientas": ["buscar_conocimiento", "consultar_pedido", "derivar_a_humano"],
  "umbralConfianza": 0.7,
  "memoria": { "conversacion": true, "cliente": true },
  "evals": [{ "caso": "pregunta simple", "esperado": "responde sin derivar" }],
  "guardarrailes": ["no inventar datos", "si dudas, derivar"]
}
```

## 4. Formato de un workflow
```json
{
  "schemaVersion": "1.0",
  "slug": "reclamo-postventa",
  "nombre": "Flujo de Reclamos",
  "nodos": [
    { "id": "n1", "tipo": "disparador", "canal": "whatsapp" },
    { "id": "n2", "tipo": "agente", "agente": "postventa" },
    { "id": "n3", "tipo": "condicion", "expresion": "confianza < 0.7" },
    { "id": "n4", "tipo": "revision_humana" },
    { "id": "n5", "tipo": "accion", "accion": "responder" }
  ],
  "conexiones": [
    { "de": "n1", "a": "n2" },
    { "de": "n2", "a": "n3" },
    { "de": "n3", "a": "n4", "cuando": "verdadero" },
    { "de": "n3", "a": "n5", "cuando": "falso" }
  ]
}
```

## 5. Por qué esto vende
- **Confianza:** el cliente ve exactamente qué hace la IA con sus datos.
- **Educación:** entiende el producto y descubre nuevos usos.
- **Lock-in sano:** mientras más plantillas usa, más valor y más difícil irse.
- **Comunidad (roadmap):** un marketplace de plantillas compartidas.

## 6. Reglas
- Las plantillas descargables **no incluyen datos ni secretos** del cliente: solo la "receta".
- Versionadas (`schemaVersion`) para compatibilidad.
- Cada plantilla del catálogo tiene su ficha visual en la Biblioteca.
