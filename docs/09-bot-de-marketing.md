# 09 · Bot de Marketing del Plan

El **bot de marketing** es un add-on estrella: un agente (o conjunto de agentes) que ayuda a la PYME a **conseguir y retener clientes**. Es el mismo motor de agentes de Kaudal, aplicado al marketing de la propia empresa cliente.

## 1. Qué hace (casos probados)
1. **Generador de contenido:** posts para redes, copies de anuncios, descripciones de productos, newsletters — con la **voz de la marca** del cliente.
2. **Calendario de contenido:** propone y programa un calendario semanal/mensual.
3. **Respuesta a comentarios y DMs:** contesta comentarios de redes e Instagram DM (con aprobación).
4. **Campañas por WhatsApp/email:** secuencias de bienvenida, promociones, reactivación de clientes (respetando opt-in y horarios).
5. **Landing pages de campaña:** genera y publica landings (vía `marketing-deployer`) con formulario que cae al CRM.
6. **Análisis simple:** qué contenido funcionó, sugerencias de mejora.

## 2. Cómo funciona (arquitectura)
- Usa el **Agente de Marketing de Contenido** (`docs/03`, A6) sobre Mastra.
- **Perfil de marca:** onboarding donde el cliente define tono, público, do's & don'ts, ejemplos. Se guarda como memoria del agente.
- **RAG de marca:** productos, promociones, FAQs → el bot responde y crea con info real.
- **Aprobación humana por defecto:** genera **borradores**; un humano aprueba antes de publicar. Se puede subir el nivel de autonomía con el tiempo.
- **Publicación:** integraciones con Meta (Instagram/Facebook), WhatsApp Business, email (Resend/SendGrid).

## 3. Guardarraíles (marketing responsable)
- **Consentimiento:** solo se contacta a quien dio opt-in (coordinado con `compliance-cl`).
- **Frecuencia y horarios:** límites para no saturar.
- **Nada de spam ni claims falsos:** el bot no promete lo que la empresa no ofrece.
- **Marca segura:** revisión de tono; el humano tiene la última palabra.
- **Todo auditado:** qué se publicó, cuándo y con qué resultado.

## 4. Cómo se vende
- **Add-on** en planes Pyme (opcional), incluido en Pro y Empresa (ver `docs/05`).
- Se puede vender solo (marketing) como puerta de entrada y luego expandir a los otros agentes (pricing de suite).
- Métrica de valor para el cliente: contenido publicado, alcance, leads generados, clientes reactivados.

## 5. Flujo de una campaña (ejemplo)
1. El dueño dice: "quiero promocionar el 2x1 de esta semana".
2. El bot propone: 3 posts + 1 historia + 1 mensaje de WhatsApp + una landing.
3. El dueño aprueba/edita en una vista visual bonita.
4. `marketing-deployer` publica y programa todo con tracking (UTM).
5. El bot reporta resultados y sugiere el siguiente paso.

## 6. Roadmap del bot
- Now: generación de contenido + calendario + aprobación + WhatsApp/email.
- Next: publicación directa a Instagram/Facebook, A/B testing de copies.
- Later: optimización automática por resultados, generación de imágenes/video de marca.
