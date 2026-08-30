// Tarea 2.3 · api_keys_cifradas (tabla base, SEGURIDAD CRÍTICA) y
// public.api_keys_publicas (única puerta de lectura para el frontend).

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type TwoOrgFixtures, RlsTx, seedTwoOrgs } from "./helpers/db";

describe("api_keys_cifradas: authenticated no tiene NINGÚN privilegio sobre la tabla base", () => {
  let tx: RlsTx;
  let f: TwoOrgFixtures;

  beforeEach(async () => {
    tx = await RlsTx.begin();
    f = await seedTwoOrgs(tx);
  });

  afterEach(async () => {
    await tx.rollback();
  });

  it("un cliente no puede hacer SELECT a la tabla base, ni de su propia key (permission denied)", async () => {
    await tx.actAs(f.a.clienteAuthId);
    await expect(
      tx.query("select id from public.api_keys_cifradas where id = $1", [f.a.apiKeyId]),
    ).rejects.toThrow(/permission denied/i);
  });

  it("un operador tampoco puede hacer SELECT a la tabla base (permission denied)", async () => {
    await tx.actAs(f.a.operadorAuthId);
    await expect(
      tx.query("select id from public.api_keys_cifradas where id = $1", [f.a.apiKeyId]),
    ).rejects.toThrow(/permission denied/i);
  });

  it("un cliente no puede INSERT/UPDATE/DELETE en la tabla base (permission denied)", async () => {
    await tx.actAs(f.a.clienteAuthId);

    const errInsert = await tx.queryExpectingError(
      `insert into public.api_keys_cifradas
         (cliente_id, org_id, proveedor, key_ciphertext, key_iv, key_auth_tag)
       values ($1, $2, 'anthropic', decode('00','hex'), decode('00','hex'), decode('00','hex'))`,
      [f.a.clienteId, f.a.orgId],
    );
    expect(errInsert.message).toMatch(/permission denied/i);

    const errUpdate = await tx.queryExpectingError(
      "update public.api_keys_cifradas set estado = 'revocada' where id = $1",
      [f.a.apiKeyId],
    );
    expect(errUpdate.message).toMatch(/permission denied/i);

    const errDelete = await tx.queryExpectingError(
      "delete from public.api_keys_cifradas where id = $1",
      [f.a.apiKeyId],
    );
    expect(errDelete.message).toMatch(/permission denied/i);
  });
});

describe("api_keys_publicas: metadatos filtrados por tenant, jamás material criptográfico", () => {
  let tx: RlsTx;
  let f: TwoOrgFixtures;

  beforeEach(async () => {
    tx = await RlsTx.begin();
    f = await seedTwoOrgs(tx);
  });

  afterEach(async () => {
    await tx.rollback();
  });

  it("[camino feliz] el cliente de Org A ve la key de su propio cliente en la vista", async () => {
    await tx.actAs(f.a.clienteAuthId);
    const res = await tx.query("select * from public.api_keys_publicas where id = $1", [
      f.a.apiKeyId,
    ]);
    expect(res.rowCount).toBe(1);
    expect(res.rows[0]).toMatchObject({ id: f.a.apiKeyId, key_last4: "9999" });
  });

  it("la vista nunca expone key_ciphertext / key_iv / key_auth_tag", async () => {
    await tx.actAs(f.a.clienteAuthId);
    const res = await tx.query("select * from public.api_keys_publicas where id = $1", [
      f.a.apiKeyId,
    ]);
    const columnas = Object.keys(res.rows[0]);
    expect(columnas).not.toContain("key_ciphertext");
    expect(columnas).not.toContain("key_iv");
    expect(columnas).not.toContain("key_auth_tag");
  });

  it("el cliente de Org A no ve la key de Org B a través de la vista", async () => {
    await tx.actAs(f.a.clienteAuthId);
    const listado = await tx.query("select id from public.api_keys_publicas");
    expect(listado.rows.map((r: any) => r.id)).not.toContain(f.b.apiKeyId);

    const porId = await tx.query("select id from public.api_keys_publicas where id = $1", [
      f.b.apiKeyId,
    ]);
    expect(porId.rowCount).toBe(0);
  });

  it("[camino feliz] el operador de Org A ve la key a través de la vista (alcance de toda la org)", async () => {
    await tx.actAs(f.a.operadorAuthId);
    const res = await tx.query("select id from public.api_keys_publicas where id = $1", [
      f.a.apiKeyId,
    ]);
    expect(res.rowCount).toBe(1);
  });

  it("el operador de Org A no ve la key de Org B a través de la vista", async () => {
    await tx.actAs(f.a.operadorAuthId);
    const res = await tx.query("select id from public.api_keys_publicas where id = $1", [
      f.b.apiKeyId,
    ]);
    expect(res.rowCount).toBe(0);
  });
});
