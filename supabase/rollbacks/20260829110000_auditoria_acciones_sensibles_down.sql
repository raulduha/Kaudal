-- Rollback de 20260829110000_auditoria_acciones_sensibles.sql.
-- Las filas ya escritas no se borran: audit_log es append-only.

drop trigger if exists trg_cobros_auditar_acciones_sensibles on public.cobros;
drop trigger if exists trg_suscripciones_auditar_acciones_sensibles on public.suscripciones;
drop trigger if exists trg_agentes_auditar_acciones_sensibles on public.agentes;
drop trigger if exists trg_usuarios_auditar_acciones_sensibles on public.usuarios;
drop trigger if exists trg_clientes_auditar_acciones_sensibles on public.clientes;
drop function if exists app.auditar_accion_sensible();
