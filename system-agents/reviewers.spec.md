# reviewers — Security / Quality / Compliance (BLOQUEANTES)

Tres revisores que corren en paralelo antes de que un agente salga vivo. Si alguno falla, el pipeline queda "bloqueado" con motivo.

## reviewer-security
Valida: aislamiento por `orgId`, secretos server-side, firma de webhooks, permisos de tools del agente.
Salida (Zod): `{ passed:boolean, findings:[{sev,desc}] }`. Bloquea si hay hallazgo alto.

## reviewer-quality
Corre las **evals** del agente (Mastra) contra sus casos definidos.
Salida: `{ passed:boolean, score, failed:[caso] }`. Bloquea si score < mínimo.

## reviewer-compliance
Verifica datos personales (Ley 19.628 / 21.719) y consentimiento del canal.
Salida: `{ passed:boolean, issues:[...] }`. Bloquea si falta consentimiento u opt-in.

**Común:** acotados al `orgId`, auditan su veredicto, y son la última puerta antes de "vivo".
