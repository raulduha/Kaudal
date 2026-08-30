# 05 · Modelo de Cobro (estilo Chile)

> Este modelo adapta la lógica de la propuesta de referencia **OxideLabs VF-2026-001** al producto Kaudal. Todos los valores son **netos en CLP; se agrega IVA (19%)**. Los montos de abajo son **plantillas de referencia**: ajústalos a tu costo real (consumo de modelos, infra y soporte) antes de cotizar.

## 1. Dos formas de vender, según el cliente
Kaudal se vende de dos maneras que conviven:

- **A. SaaS por suscripción (PYMES):** planes mensuales/anuales, autoservicio o con onboarding. Es el volumen.
- **B. Proyecto/empresa (a la OxideLabs):** cuando un cliente grande quiere on-premise, licencia o infra propia. Son 4 modalidades (más abajo), igual que la referencia.

## 2. A · Planes SaaS (suscripción)

| | **Partida** | **Pyme** | **Pro** | **Empresa** |
|---|---|---|---|---|
| Precio mensual (neto) | $79.000 + IVA | $190.000 + IVA | $390.000 + IVA | Desde $790.000 + IVA |
| Agentes activos | 1 | 3 | 8 | Ilimitados |
| Conversaciones/mes incluidas | 500 | 3.000 | 12.000 | A medida |
| Usuarios internos | 2 | 5 | 15 | A medida |
| Canal WhatsApp | ✅ | ✅ | ✅ | ✅ |
| Workflows visuales | Básicos | ✅ | ✅ | ✅ |
| Bandeja de revisión humana | ✅ | ✅ | ✅ | ✅ |
| Auditoría completa | ✅ | ✅ | ✅ | ✅ |
| Biblioteca descargable | ✅ | ✅ | ✅ | ✅ |
| Bot de marketing | — | Opcional | ✅ | ✅ |
| Soporte | Email | Email + chat | Prioritario | 24/7 con SLA |
| Onboarding | Autoservicio | Guiado (1 sesión) | Acompañado | Dedicado |

**Notas:**
- **Consumo extra:** conversaciones sobre lo incluido se cobran por paquete (ej: +1.000 conversaciones = $25.000 + IVA). Ajustar al costo real de modelo.
- **Anual con descuento:** 2 meses gratis al pagar 12 (equivale a ~17% off). Guiño al "descuento por prepago" de la referencia.
- **Add-ons:** bot de marketing, agente extra, integración a medida, canal adicional (Instagram/email).
- **Setup / puesta en marcha:** en planes Pro/Empresa puede cobrarse un **fee único de implementación** (ej: $500.000–$1.500.000 + IVA) según integraciones — igual que el "paquete de puesta en marcha" de la referencia.

## 3. B · Modalidades tipo proyecto (para clientes grandes)
Espejo de las 4 modalidades de la referencia OxideLabs. Sirven cuando el cliente quiere control de infraestructura, licencia o código.

| | **1 · Suscripción anual** | **2 · Pago único on-premise** | **3 · Licencia de código fuente** | **4 · Pago único en nuestra infra** |
|---|---|---|---|---|
| Modelo | SaaS anual gestionado | Instalación en infra del cliente, pago único | Se entrega el código fuente | Pago único, corre en infra de Kaudal |
| Dónde corre | Infra de Kaudal | Infra del cliente | Infra del cliente | Infra de Kaudal |
| Quién mantiene | Kaudal | Cliente (soporte opcional) | Cliente | Kaudal |
| Soporte/actualizaciones | Permanentes, 24/7 con SLA | 6 meses; luego opcional mensual | 6 meses; luego versión congelada | Permanentes, 24/7 con SLA + fee mensual |
| Propiedad intelectual | Kaudal | Kaudal | Kaudal (licencia de uso y modificación al cliente) | Kaudal |
| Ideal para | La mayoría | Cliente con política on-premise | Cliente que quiere independencia total | Cliente que quiere pago único + servicio gestionado |

**Reglas comunes (de la referencia, adaptadas):**
- **Puesta en marcha y piloto** se cobran como un paquete único (ej: $4.000.000 + IVA) que se **abona al precio final** de la modalidad elegida.
- **Se puede cambiar de modalidad** en cualquier momento; lo ya pagado por servicio prestado no se abona a la nueva.
- **SLA** aplica a las modalidades gestionadas (1 y 4), no a las de solo-licencia (2 y 3).
- **Pricing de suite:** módulos nuevos que el cliente sume se valorizan sobre la plataforma existente (el costo marginal es menor que contratar aparte).

## 4. SLA (para planes Empresa y modalidades 1 y 4)
| Indicador | Compromiso |
|---|---|
| Disponibilidad | 99,5% mensual |
| Respuesta — incidente crítico (servicio caído) | 4 horas hábiles |
| Respuesta — severidad alta (función clave degradada) | 1 día hábil |
| Respuesta — consultas/ajustes menores | 3 días hábiles |
| Soporte | 24/7 con canal prioritario en peaks |
| Actualizaciones de producto | Incluidas, sin costo adicional |
| Mantenimiento programado | Avisado con 48h, fuera de horario hábil |

## 5. Plan de pagos (ejemplo modalidad proyecto)
Igual estructura que la referencia (hitos):
| Hito | Momento | Monto (ejemplo) |
|---|---|---|
| Cuota 1 | Al iniciar el proyecto y el piloto | $4.000.000 + IVA |
| Cuota 2 | Al finalizar el piloto y comprometer la siguiente fase | Según modalidad |
| Cuota 3 | Al pasar a producción / año calendario | Saldo |

## 6. Cómo se factura el consumo de IA (importante)
El costo variable real de Kaudal es el **consumo de modelos**. Dos opciones:
- **Incluido con tope** (recomendado para PYMES): cada plan trae X conversaciones; el excedente se cobra por paquete. Simple para el cliente.
- **Passthrough + margen** (clientes grandes): se traslada el consumo real de modelo con un margen de gestión.
> Antes de fijar precios finales, calcula el costo por conversación (tokens promedio × precio del modelo) y asegúrate de que cada plan tenga margen sano incluso en el peor caso de uso.

## 7. Acuerdos de colaboración (de la referencia)
- Poder mencionar al cliente como caso de éxito (con su aprobación).
- Horas de referencia para procesos de venta (coordinadas y sin exclusividad).
- El cliente es **dueño de sus datos**; la plataforma y el código son de Kaudal (salvo modalidad 3).

## 8. Validez y contacto
- Validez de una propuesta: 30 días (como la referencia).
- Toda cotización se genera desde este modelo, ajustando montos al caso.
