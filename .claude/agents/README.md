# Subagentes de Claude Code — Kaudal

Estos subagentes ayudan a **construir** Kaudal de forma segura y ordenada. Claude Code los invoca automáticamente según la tarea, o puedes pedirlos por nombre.

| Archivo | Criticidad | Rol |
|---|---|---|
| `security-auditor.md` | 🔴 Vital | Auditoría de seguridad antes de merge (auth, datos, pagos, webhooks) |
| `code-reviewer.md` | 🔴 Vital | Revisión de todo PR |
| `db-guardian.md` | 🔴 Vital | Migraciones y RLS (aislamiento multi-tenant) |
| `diseno-moderno.md` | 🔴 Vital | Diseño moderno/visual y consistencia de marca (UI bonita) |
| `accesibilidad.md` | 🟠 Casi vital | Accesibilidad WCAG AA (contraste, teclado, lectores) |
| `compliance-cl.md` | 🔴 Vital | Datos personales — Ley 19.628 / 21.719 (Chile) |
| `deployment.md` | 🟠 Casi vital | Checklist y despliegue seguro + rollback |
| `qa-tester.md` | 🟠 Casi vital | Diseño y ejecución de pruebas |
| `devops-infra.md` | 🟠 Casi vital | Entornos, secretos, CI/CD, backups, on-premise |
| `agent-builder.md` | 🟠 Casi vital | Crear agentes de negocio desde plantilla |
| `marketing-deployer.md` | 🟡 Útil | Publicar landing/campañas del bot de marketing |
| `docs-writer.md` | 🟡 Útil | Mantener la documentación |

## Cómo se usan
- Automático: al pedir "revisa este PR" o "prepara el deploy", Claude Code elige el subagente.
- Manual: "usa el subagente `security-auditor` en este cambio".

## Flujo recomendado por PR
1. `code-reviewer` → 2. `security-auditor` (si toca zonas sensibles) → 3. `db-guardian` (si hay migración) → 4. `qa-tester` → 5. `deployment`.

## Modelo por subagente
Los subagentes críticos usan `opus` (más criterio); el resto `sonnet` (rápido y económico). Ajusta en el frontmatter de cada archivo.
