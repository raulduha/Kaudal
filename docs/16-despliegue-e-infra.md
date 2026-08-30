# 16 · Despliegue e Infraestructura (dónde y cómo lo subes)

> Cómo va a estar corriendo TU plataforma Kaudal (el panel operador), por etapas, con costos reales. Regla: parte barato y local, sube a la nube cuando tengas clientes pagando.
> Valores de referencia (verifica al contratar). USD↔CLP aprox 1 USD ≈ $950 CLP a agosto 2026 — ajusta.

## 1. Etapas de despliegue (de barato a serio)

### Etapa A — Local / Raspberry Pi (AHORA, mientras desarrollas y tienes 0-2 clientes)
- **Qué corre:** el panel Kaudal + tu n8n, en tu máquina o en la Raspberry Pi, con Docker.
- **Acceso desde afuera:** un túnel (Cloudflare Tunnel gratis) para exponer el portal del cliente sin abrir puertos.
- **Costo:** ~$0 (electricidad). La Pi ya la tienes.
- **Límite:** si se corta la luz/internet en tu casa, se cae. OK para desarrollo y demos, **riesgoso para un cliente que paga**.
- **Veredicto:** perfecto para partir y probar. No lo dejes como producción de un cliente serio.

### Etapa B — Railway (RECOMENDADA al tener 1+ cliente pagando)
- **Qué es:** plataforma que despliega tu app y base de datos con `git push`. Simple, sin administrar servidor.
- **Costo:** plan **Hobby ~US$5/mes** (incluye ~US$5 de uso); **Pro ~US$20/mes** + consumo según recursos. Para el MVP, Hobby o Pro chico alcanza (~$5.000–$20.000 CLP/mes).
- **Bueno para:** subir rápido, sin DevOps. Escala con un clic.
- **Veredicto:** el mejor punto medio para tu MVP en la nube. Empieza aquí cuando salgas de local.

### Etapa C — VPS propio (cuando quieras control/costo fijo)
- **Qué es:** un servidor Linux tuyo (Hetzner, DigitalOcean) con Docker.
- **Costo:** Hetzner desde ~€4–8/mes (~$4.000–$8.000 CLP); DigitalOcean desde ~US$6–12/mes.
- **Bueno para:** costo fijo y control total; correr n8n + Kaudal + Postgres juntos.
- **Veredicto:** para cuando tengas varios clientes y quieras optimizar costo. Requiere que administres tú (o `devops-infra`).

## 2. Piezas y dónde viven
| Pieza | Etapa A (local/Pi) | Etapa B (Railway) | Etapa C (VPS) |
|---|---|---|---|
| Panel Kaudal (Next/Nest) | Docker en Pi | Servicio Railway | Docker en VPS |
| Base de datos | Postgres local o Supabase free | Postgres Railway o Supabase | Postgres en VPS o Supabase |
| n8n (motor agentes) | Docker en Pi | Railway o sigue en tu n8n | Docker en VPS |
| Túnel/dominio | Cloudflare Tunnel | Dominio Railway/propio | Nginx + dominio propio |

## 3. Costos mensuales estimados del MVP (todo junto)
| Ítem | Etapa A | Etapa B (Railway) |
|---|---|---|
| Hosting app + n8n | ~$0 (Pi) | ~US$5–20 |
| Base de datos | $0 (Supabase free) | $0–US$25 (Supabase Pro si crece) |
| Pasarela Flow | Comisión por transacción (sin fijo) | igual |
| Proveedor DTE (boletas) | plan bajo (varía) | igual |
| Dominio (.cl) | ~$10.000 CLP/año | igual |
| **Consumo de modelos (IA)** | **variable — el costo REAL** | **variable** |
> El hosting es barato. **El costo que manda es el consumo de modelos por uso**, y eso se calcula por agente (ver §4 y la calculadora).

## 4. El costo que importa: consumo por agente
El hosting es fijo y chico. Lo que define si un agente es negocio es el **costo por uso** (tokens × precio del modelo). Por eso el panel debe mostrar, por agente: cuántas veces se usa al mes → cuánto cuesta → cuánto cobrar. Eso está en la **Calculadora de economía por agente** (entregada aparte) y debe vivir dentro de Kaudal como una pantalla.

## 5. Cómo se despliega (flujo técnico, resumen)
1. Repo con Docker (`Dockerfile` + `docker-compose` para Pi/VPS).
2. Variables de entorno (llaves n8n, Flow, DTE, modelo) — nunca en el código.
3. Etapa A: `docker compose up` en la Pi + Cloudflare Tunnel.
4. Etapa B: conectar el repo a Railway, definir variables, deploy automático por push.
5. `devops-infra` (subagente Claude Code) arma CI, backups y el compose.

## 6. Recomendación final (crítica)
- **Hoy:** local/Raspberry para construir y demostrar. $0.
- **Primer cliente que paga:** sube a **Railway** (Hobby/Pro). Un cliente que paga no puede depender de la luz de tu casa.
- **Varios clientes:** evalúa VPS por costo fijo.
- No pagues nube "por si acaso" antes de tener a quién cobrarle.
