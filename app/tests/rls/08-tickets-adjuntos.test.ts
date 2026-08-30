// Tarea 9.1/9.2 · Capa de datos de "Dudas y reclamos".
//
// Cubre lo que agregan
//   supabase/migrations/20260827200000_tickets_adjuntos_9_1.sql            y
//   supabase/migrations/20260827210000_tickets_adjuntos_9_1_seguimiento.sql
// (esta segunda cierra los 2 hallazgos de security-auditor: la carpeta de
//  visibilidad en la ruta y el tope de objetos por ticket):
//   · Bucket privado `ticket-attachments` y sus politicas sobre storage.objects
//     (aislamiento entre orgs, entre clientes de la MISMA org, y entre lo
//     publico y las notas internas DEL MISMO TICKET).
//   · Tope de creacion de tickets dentro de la BD (docs/eng/08 §14).
//   · Maquina de estados de docs/eng/08 §3 aplicada al escribir un mensaje.
//   · cerrado_en y ultimo_mensaje_en mantenidos por trigger.
//   · Auditoria automatica de alta / estado / prioridad.
//   · RPC public.marcar_mensajes_leidos(uuid).
//
// Los inserts contra storage.objects son fieles a lo que hace la Storage API:
// inserta en esa tabla con el rol `authenticated` y los claims del JWT, que es
// exactamente lo que simula RlsTx.actAs().

import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MARCA_TEST, DOMINIO_TEST, type TwoOrgFixtures, RlsTx, seedTwoOrgs } from "./helpers/db";

const BUCKET = "ticket-attachments";

type Visibilidad = "publico" | "interno";

/**
 * Ruta valida: {org_id}/{ticket_id}/{visibilidad}/{uuid}-{archivo}.
 * El tercer segmento lo agrego la migracion de seguimiento: sin el, el adjunto
 * de una nota interna caia en la misma carpeta que los publicos y el cliente
 * duenno del ticket podia leerlo.
 */
function ruta(
  orgId: string,
  ticketId: string,
  visibilidad: Visibilidad = "publico",
  archivo = "captura.png",
): string {
  return `${orgId}/${ticketId}/${visibilidad}/${randomUUID()}-${archivo}`;
}

/** Inserta como `postgres` (bypassa RLS): sirve para dejar objetos ya subidos. */
async function sembrarObjeto(tx: RlsTx, name: string) {
  return tx.query(
    `insert into storage.objects (bucket_id, name, metadata)
     values ($1, $2, '{}'::jsonb)`,
    [BUCKET, name],
  );
}

async function subir(tx: RlsTx, name: string) {
  return tx.query(
    `insert into storage.objects (bucket_id, name, metadata)
     values ($1, $2, '{"mimetype":"image/png","size":1024}'::jsonb)
     returning id`,
    [BUCKET, name],
  );
}

/** Segundo cliente dentro de la MISMA org: el vecino del que hay que aislarse. */
async function segundoClienteDeOrgA(tx: RlsTx, f: TwoOrgFixtures) {
  const suffix = randomUUID().slice(0, 8);
  const cliente = await tx.query<{ id: string }>(
    `insert into public.clientes (org_id, razon_social, email)
     values ($1, $2, $3) returning id`,
    [f.a.orgId, `${MARCA_TEST} Cliente A2 ${suffix}`, `cliente-a2-${suffix}@${DOMINIO_TEST}`],
  );
  const ticket = await tx.query<{ id: string }>(
    `insert into public.tickets_reclamos (org_id, cliente_id, asunto)
     values ($1, $2, $3) returning id`,
    [f.a.orgId, cliente.rows[0].id, `${MARCA_TEST} Duda del vecino`],
  );
  return { clienteId: cliente.rows[0].id, ticketId: ticket.rows[0].id };
}

describe("adjuntos: bucket ticket-attachments", () => {
  let tx: RlsTx;
  let f: TwoOrgFixtures;

  beforeEach(async () => {
    tx = await RlsTx.begin();
    f = await seedTwoOrgs(tx);
  });

  afterEach(async () => {
    await tx.rollback();
  });

  it("el bucket es privado y trae los limites de docs/eng/08 §7", async () => {
    await tx.actAsPostgres();
    const res = await tx.query(
      "select public, file_size_limit, allowed_mime_types from storage.buckets where id = $1",
      [BUCKET],
    );
    expect(res.rowCount).toBe(1);
    expect(res.rows[0].public).toBe(false);
    expect(Number(res.rows[0].file_size_limit)).toBe(10 * 1024 * 1024);
    expect(res.rows[0].allowed_mime_types).not.toContain("application/octet-stream");
    expect(res.rows[0].allowed_mime_types).toContain("application/pdf");
  });

  it("[camino feliz] el cliente sube y lee un adjunto de SU propio ticket", async () => {
    await tx.actAs(f.a.clienteAuthId);
    const path = ruta(f.a.orgId, f.a.ticketId);

    const insertado = await subir(tx, path);
    expect(insertado.rowCount).toBe(1);

    const leido = await tx.query("select name from storage.objects where name = $1", [path]);
    expect(leido.rowCount).toBe(1);
  });

  it("el cliente de Org A no puede subir bajo el org_id de Org B", async () => {
    await tx.actAs(f.a.clienteAuthId);
    await expect(subir(tx, ruta(f.b.orgId, f.b.ticketId))).rejects.toThrow(
      /row-level security policy/i,
    );
  });

  it("acertar el org_id no basta: el cliente no puede subir al ticket de OTRO cliente de su misma org", async () => {
    const vecino = await segundoClienteDeOrgA(tx, f);

    await tx.actAs(f.a.clienteAuthId);
    await expect(subir(tx, ruta(f.a.orgId, vecino.ticketId))).rejects.toThrow(
      /row-level security policy/i,
    );
  });

  it("el cliente tampoco LEE el adjunto de otro cliente de su misma org", async () => {
    const vecino = await segundoClienteDeOrgA(tx, f);
    const pathVecino = ruta(f.a.orgId, vecino.ticketId);
    await tx.query(
      `insert into storage.objects (bucket_id, name, metadata)
       values ($1, $2, '{}'::jsonb)`,
      [BUCKET, pathVecino],
    );

    await tx.actAs(f.a.clienteAuthId);
    const res = await tx.query("select name from storage.objects where name = $1", [pathVecino]);
    expect(res.rowCount).toBe(0);
  });

  it("[camino feliz] el operador de su org lee el adjunto del cliente; el operador de otra org no", async () => {
    const path = ruta(f.a.orgId, f.a.ticketId);
    await tx.query(
      `insert into storage.objects (bucket_id, name, metadata)
       values ($1, $2, '{}'::jsonb)`,
      [BUCKET, path],
    );

    await tx.actAs(f.a.operadorAuthId);
    expect(
      (await tx.query("select name from storage.objects where name = $1", [path])).rowCount,
    ).toBe(1);

    await tx.actAs(f.b.operadorAuthId);
    expect(
      (await tx.query("select name from storage.objects where name = $1", [path])).rowCount,
    ).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Hallazgo ALTO de security-auditor sobre 9.1: el adjunto de una NOTA INTERNA
// vivia en la misma carpeta que los publicos, asi que el cliente duenno del
// ticket lo alcanzaba por storage.objects (select/list) aunque
// mensajes_ticket si le escondiera la nota. La migracion de seguimiento mete
// la visibilidad en la ruta y se la exige a la policy.
// ---------------------------------------------------------------------------
describe("adjuntos: la carpeta 'interno' es solo del operador (hallazgo ALTO)", () => {
  let tx: RlsTx;
  let f: TwoOrgFixtures;

  beforeEach(async () => {
    tx = await RlsTx.begin();
    f = await seedTwoOrgs(tx);
  });

  afterEach(async () => {
    await tx.rollback();
  });

  it("el cliente NO lee el adjunto interno de SU PROPIO ticket, ni acertando la ruta exacta", async () => {
    // El objeto lo deja el operador (via postgres, que bypassa RLS: da igual
    // quien lo escribio, lo que se prueba es la lectura).
    const interno = ruta(f.a.orgId, f.a.ticketId, "interno", "evidencia-cobro.pdf");
    const publico = ruta(f.a.orgId, f.a.ticketId, "publico");
    await sembrarObjeto(tx, interno);
    await sembrarObjeto(tx, publico);

    await tx.actAs(f.a.clienteAuthId);

    // (1) Acertando el nombre COMPLETO del objeto, que es el peor caso: el
    //     uuid del nombre nunca fue un control de acceso.
    const porNombre = await tx.query("select name from storage.objects where name = $1", [interno]);
    expect(porNombre.rowCount).toBe(0);

    // (2) Listando la carpeta de su propio ticket: solo ve lo publico. Es el
    //     camino que usa la Storage API para `list` (storage.search es
    //     SECURITY INVOKER, o sea pasa por RLS).
    const listado = await tx.query(
      "select name from storage.objects where bucket_id = $1 and name like $2",
      [BUCKET, `${f.a.orgId}/${f.a.ticketId}/%`],
    );
    expect(listado.rows.map((r: any) => r.name)).toEqual([publico]);
  });

  it("[camino feliz] el operador de la org SI lee el adjunto interno; el de otra org no", async () => {
    const interno = ruta(f.a.orgId, f.a.ticketId, "interno");
    await sembrarObjeto(tx, interno);

    await tx.actAs(f.a.operadorAuthId);
    expect(
      (await tx.query("select name from storage.objects where name = $1", [interno])).rowCount,
    ).toBe(1);

    await tx.actAs(f.b.operadorAuthId);
    expect(
      (await tx.query("select name from storage.objects where name = $1", [interno])).rowCount,
    ).toBe(0);
  });

  it("el cliente tampoco ESCRIBE en la carpeta interna de su ticket", async () => {
    // Si pudiera, se colaria un archivo en el hilo privado del operador.
    await tx.actAs(f.a.clienteAuthId);
    await expect(subir(tx, ruta(f.a.orgId, f.a.ticketId, "interno"))).rejects.toThrow(
      /row-level security policy/i,
    );
  });

  it("[camino feliz] el operador sube tanto a 'publico' como a 'interno'", async () => {
    await tx.actAs(f.a.operadorAuthId);
    expect((await subir(tx, ruta(f.a.orgId, f.a.ticketId, "publico"))).rowCount).toBe(1);
    expect((await subir(tx, ruta(f.a.orgId, f.a.ticketId, "interno"))).rowCount).toBe(1);
  });

  it("un adjunto interno de OTRO cliente de la misma org tampoco se lee", async () => {
    const vecino = await segundoClienteDeOrgA(tx, f);
    const interno = ruta(f.a.orgId, vecino.ticketId, "interno");
    await sembrarObjeto(tx, interno);

    await tx.actAs(f.a.clienteAuthId);
    expect(
      (await tx.query("select name from storage.objects where name = $1", [interno])).rowCount,
    ).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Hallazgo MEDIO: el bucket no tenia tope y no hay ninguna via de borrado
// (sin policy de DELETE y con el trigger protect_objects_delete de storage),
// asi que era almacenamiento facturable ilimitado alcanzable con el JWT del
// cliente, saltandose el rate-limit del Route Handler.
// ---------------------------------------------------------------------------
describe("adjuntos: tope de 30 objetos por ticket (hallazgo MEDIO)", () => {
  let tx: RlsTx;
  let f: TwoOrgFixtures;

  beforeEach(async () => {
    tx = await RlsTx.begin();
    f = await seedTwoOrgs(tx);
  });

  afterEach(async () => {
    await tx.rollback();
  });

  /**
   * Deja `n` objetos ya subidos en el ticket, como `postgres` (bypassa RLS):
   * llenar el cupo no es lo que se esta probando y hacerlo con la sesion del
   * cliente serian 29 evaluaciones de policy por test.
   */
  async function llenar(n: number, visibilidad: Visibilidad = "publico") {
    await tx.actAsPostgres();
    await tx.query(
      `insert into storage.objects (bucket_id, name, metadata)
       select $1, $2 || i::text || '-x.png', '{}'::jsonb from generate_series(1, $3::int) i`,
      [BUCKET, `${f.a.orgId}/${f.a.ticketId}/${visibilidad}/`, n],
    );
  }

  it("el cliente llega justo a 30 y el 31 se rechaza", async () => {
    await llenar(29);

    await tx.actAs(f.a.clienteAuthId);
    // El numero 30 todavia entra.
    expect((await subir(tx, ruta(f.a.orgId, f.a.ticketId))).rowCount).toBe(1);

    // El 31 no.
    const err = await tx.queryExpectingError(
      `insert into storage.objects (bucket_id, name, metadata)
       values ($1, $2, '{}'::jsonb)`,
      [BUCKET, ruta(f.a.orgId, f.a.ticketId)],
    );
    expect(err.message).toMatch(/row-level security/i);
  });

  it("el cupo es del TICKET completo: los objetos internos tambien cuentan", async () => {
    // Si el conteo mirara solo la carpeta 'publico', el tope real del ticket
    // seria 60 (30 + 30) y ademas el cliente no podria verificarlo.
    await llenar(30, "interno");

    await tx.actAs(f.a.clienteAuthId);
    const err = await tx.queryExpectingError(
      `insert into storage.objects (bucket_id, name, metadata)
       values ($1, $2, '{}'::jsonb)`,
      [BUCKET, ruta(f.a.orgId, f.a.ticketId, "publico")],
    );
    expect(err.message).toMatch(/row-level security/i);
  });

  it("el cupo es POR TICKET: el ticket del vecino no se queda sin adjuntos", async () => {
    const vecino = await segundoClienteDeOrgA(tx, f);
    await llenar(30);

    await tx.actAsPostgres();
    // Otro ticket, misma org: su carpeta esta vacia, asi que hay cupo.
    const hayCupo = await tx.query<{ ok: boolean }>(
      "select app.hay_cupo_adjuntos_ticket($1) as ok",
      [ruta(f.a.orgId, vecino.ticketId)],
    );
    expect(hayCupo.rows[0].ok).toBe(true);
  });

  it("el operador queda exento del tope (no hay ninguna via de borrado que lo desbloquee)", async () => {
    await llenar(30);

    await tx.actAs(f.a.operadorAuthId);
    expect((await subir(tx, ruta(f.a.orgId, f.a.ticketId, "interno"))).rowCount).toBe(1);
    expect((await subir(tx, ruta(f.a.orgId, f.a.ticketId, "publico"))).rowCount).toBe(1);
  });

  it("el tope no se salta cambiando la forma textual del uuid del ticket", async () => {
    // Con la carpeta llena, 'ABCD-...' seria una carpeta NUEVA si la policy
    // no exigiera la forma canonica. Debe rechazarse igual.
    await llenar(30);

    await tx.actAs(f.a.clienteAuthId);
    const err = await tx.queryExpectingError(
      `insert into storage.objects (bucket_id, name, metadata)
       values ($1, $2, '{}'::jsonb)`,
      [BUCKET, `${f.a.orgId}/${f.a.ticketId.toUpperCase()}/publico/${randomUUID()}-x.png`],
    );
    expect(err.message).toMatch(/row-level security/i);
  });

  it("el tope no filtra nada de otra org: devuelve false sin lanzar excepcion", async () => {
    // Se devuelve booleano (y no un raise amable tipo PT429) justo para esto:
    // dentro de un WITH CHECK el orden de los AND no esta garantizado, y un
    // error especifico contaria cuantos adjuntos tiene un ticket ajeno.
    await tx.actAs(f.a.clienteAuthId);
    const res = await tx.query<{ ok: boolean }>(
      "select app.hay_cupo_adjuntos_ticket($1) as ok",
      [`${f.b.orgId}/${f.b.ticketId}/publico/${randomUUID()}-x.png`],
    );
    // Hay cupo (el ticket de B esta vacio) pero el INSERT igual se niega por
    // puede_tocar_adjunto_ticket: son dos preguntas distintas a proposito.
    expect(res.rows[0].ok).toBe(true);
    await expect(subir(tx, `${f.b.orgId}/${f.b.ticketId}/publico/${randomUUID()}-x.png`)).rejects.toThrow(
      /row-level security policy/i,
    );
  });
});

describe("adjuntos: forma de la ruta y escrituras prohibidas", () => {
  let tx: RlsTx;
  let f: TwoOrgFixtures;

  beforeEach(async () => {
    tx = await RlsTx.begin();
    f = await seedTwoOrgs(tx);
  });

  afterEach(async () => {
    await tx.rollback();
  });

  it("una ruta fuera de la forma {org}/{ticket}/{visibilidad}/{archivo} se rechaza", async () => {
    await tx.actAs(f.a.clienteAuthId);

    // Cada intento va con queryExpectingError (savepoint propio): un error de
    // Postgres aborta la transaccion entera y los siguientes no se ejecutarian.
    const rutas = [
      // Sin carpeta de ticket: quedaria suelto en la raiz de la org.
      `${f.a.orgId}/suelto.png`,
      // LA FORMA VIEJA (2 segmentos, sin visibilidad): es el hallazgo ALTO.
      // Tiene que estar cerrada, o el cliente podria volver a dejar/leer
      // archivos en la carpeta ambigua del ticket.
      `${f.a.orgId}/${f.a.ticketId}/${randomUUID()}-captura.png`,
      // Un nivel de mas: el tercer segmento ya no seria la visibilidad.
      `${f.a.orgId}/${f.a.ticketId}/publico/extra/anidado.png`,
      // Tercer segmento que no es un vocabulario conocido.
      `${f.a.orgId}/${f.a.ticketId}/privado/${randomUUID()}-x.png`,
      `${f.a.orgId}/${f.a.ticketId}/PUBLICO/${randomUUID()}-x.png`,
      `${f.a.orgId}/${f.a.ticketId}//${randomUUID()}-x.png`,
      // Segmentos que no son uuid: el cast no debe explotar, debe denegar.
      "no-es-uuid/tampoco/publico/archivo.png",
    ];

    for (const path of rutas) {
      const err = await tx.queryExpectingError(
        `insert into storage.objects (bucket_id, name, metadata)
         values ($1, $2, '{}'::jsonb)`,
        [BUCKET, path],
      );
      expect(err.message).toMatch(/row-level security/i);
    }
  });

  it("el uuid tiene que ir en forma canonica: mayusculas o llaves se rechazan", async () => {
    // No es cosmetico: '{A0EE...}' y 'a0ee...' castean al MISMO uuid pero son
    // strings distintos, o sea carpetas distintas. Sin exigir la forma
    // canonica, un cliente se saltaria el tope de 30 objetos por ticket
    // generando una variante textual nueva cada vez.
    await tx.actAs(f.a.clienteAuthId);

    const variantes = [
      `${f.a.orgId}/${f.a.ticketId.toUpperCase()}/publico/${randomUUID()}-x.png`,
      `${f.a.orgId.toUpperCase()}/${f.a.ticketId}/publico/${randomUUID()}-x.png`,
      `${f.a.orgId}/{${f.a.ticketId}}/publico/${randomUUID()}-x.png`,
    ];

    for (const path of variantes) {
      const err = await tx.queryExpectingError(
        `insert into storage.objects (bucket_id, name, metadata)
         values ($1, $2, '{}'::jsonb)`,
        [BUCKET, path],
      );
      expect(err.message).toMatch(/row-level security/i);
    }
  });

  it("no hay policy de UPDATE: un adjunto no se sobreescribe (ni el cliente ni el operador)", async () => {
    const path = ruta(f.a.orgId, f.a.ticketId);
    await tx.query(
      "insert into storage.objects (bucket_id, name, metadata) values ($1, $2, '{}'::jsonb)",
      [BUCKET, path],
    );

    await tx.actAs(f.a.clienteAuthId);
    const comoCliente = await tx.query(
      "update storage.objects set metadata = '{\"adulterado\":true}'::jsonb where name = $1",
      [path],
    );
    expect(comoCliente.rowCount).toBe(0);

    await tx.actAs(f.a.operadorAuthId);
    const comoOperador = await tx.query(
      "update storage.objects set metadata = '{}'::jsonb where name = $1",
      [path],
    );
    expect(comoOperador.rowCount).toBe(0);
  });

  it("anon (sin sesion) no ve ni sube nada al bucket", async () => {
    const path = ruta(f.a.orgId, f.a.ticketId);
    await tx.query(
      "insert into storage.objects (bucket_id, name, metadata) values ($1, $2, '{}'::jsonb)",
      [BUCKET, path],
    );

    await tx.actAsAnon();
    expect((await tx.query("select name from storage.objects")).rowCount).toBe(0);
    await expect(subir(tx, ruta(f.a.orgId, f.a.ticketId))).rejects.toThrow();
  });

  it("canario: las unicas politicas de storage.objects son las dos del bucket de adjuntos", async () => {
    await tx.actAsPostgres();
    const res = await tx.query(
      "select polname from pg_policy where polrelid = 'storage.objects'::regclass order by polname",
    );
    expect(res.rows.map((r: any) => r.polname)).toEqual([
      "adjuntos_ticket_insert",
      "adjuntos_ticket_select",
    ]);
  });
});

describe("tope de creacion de tickets (docs/eng/08 §14)", () => {
  let tx: RlsTx;
  let f: TwoOrgFixtures;

  beforeEach(async () => {
    tx = await RlsTx.begin();
    f = await seedTwoOrgs(tx);
  });

  afterEach(async () => {
    await tx.rollback();
  });

  it("el cliente crea hasta el tope y el siguiente INSERT directo se rechaza con PT429", async () => {
    await tx.actAs(f.a.clienteAuthId);

    // El fixture ya dejo 1 ticket de este cliente: quedan 9 de cupo.
    for (let i = 0; i < 9; i++) {
      const res = await tx.query(
        `insert into public.tickets_reclamos (org_id, cliente_id, asunto)
         values ($1, $2, $3) returning id`,
        [f.a.orgId, f.a.clienteId, `${MARCA_TEST} Duda ${i}`],
      );
      expect(res.rowCount).toBe(1);
    }

    const err = await tx.queryExpectingError(
      `insert into public.tickets_reclamos (org_id, cliente_id, asunto)
       values ($1, $2, 'uno de mas')`,
      [f.a.orgId, f.a.clienteId],
    );
    expect(err.code).toBe("PT429");
    expect(err.message).toMatch(/varias solicitudes seguidas/i);
  });

  it("el tope es POR CLIENTE: el vecino de la misma org no se queda sin canal", async () => {
    const vecino = await segundoClienteDeOrgA(tx, f);

    await tx.actAs(f.a.clienteAuthId);
    for (let i = 0; i < 9; i++) {
      await tx.query(
        `insert into public.tickets_reclamos (org_id, cliente_id, asunto)
         values ($1, $2, $3)`,
        [f.a.orgId, f.a.clienteId, `${MARCA_TEST} Duda ${i}`],
      );
    }
    await tx.queryExpectingError(
      `insert into public.tickets_reclamos (org_id, cliente_id, asunto)
       values ($1, $2, 'uno de mas')`,
      [f.a.orgId, f.a.clienteId],
    );

    await tx.actAsPostgres();
    const res = await tx.query(
      `insert into public.tickets_reclamos (org_id, cliente_id, asunto)
       values ($1, $2, $3) returning id`,
      [f.a.orgId, vecino.clienteId, `${MARCA_TEST} El vecino si puede`],
    );
    expect(res.rowCount).toBe(1);
  });

  it("el operador queda exento del tope", async () => {
    await tx.actAs(f.a.operadorAuthId);
    for (let i = 0; i < 15; i++) {
      const res = await tx.query(
        `insert into public.tickets_reclamos (org_id, cliente_id, asunto)
         values ($1, $2, $3) returning id`,
        [f.a.orgId, f.a.clienteId, `${MARCA_TEST} Abierto por el operador ${i}`],
      );
      expect(res.rowCount).toBe(1);
    }
  });
});

describe("estados y actividad del ticket (docs/eng/08 §3)", () => {
  let tx: RlsTx;
  let f: TwoOrgFixtures;

  beforeEach(async () => {
    tx = await RlsTx.begin();
    f = await seedTwoOrgs(tx);
  });

  afterEach(async () => {
    await tx.rollback();
  });

  it("ultimo_mensaje_en nunca queda NULL, ni con un NULL explicito en el INSERT", async () => {
    await tx.actAs(f.a.clienteAuthId);
    const res = await tx.query(
      `insert into public.tickets_reclamos (org_id, cliente_id, asunto, ultimo_mensaje_en)
       values ($1, $2, 'con null explicito', null)
       returning ultimo_mensaje_en`,
      [f.a.orgId, f.a.clienteId],
    );
    expect(res.rows[0].ultimo_mensaje_en).not.toBeNull();
  });

  it("[camino feliz] el operador cierra con un UPDATE simple: cerrado_en se llena solo", async () => {
    await tx.actAs(f.a.operadorAuthId);

    // Sin el trigger, esto violaria chk_tickets_cerrado.
    const cerrado = await tx.query(
      "update public.tickets_reclamos set estado = 'cerrado' where id = $1 returning cerrado_en",
      [f.a.ticketId],
    );
    expect(cerrado.rows[0].cerrado_en).not.toBeNull();

    const reabierto = await tx.query(
      "update public.tickets_reclamos set estado = 'abierto' where id = $1 returning cerrado_en",
      [f.a.ticketId],
    );
    expect(reabierto.rows[0].cerrado_en).toBeNull();
  });

  it("un mensaje del cliente sobre un ticket respondido lo devuelve a abierto", async () => {
    await tx.actAsPostgres();
    await tx.query("update public.tickets_reclamos set estado = 'respondido' where id = $1", [
      f.a.ticketId,
    ]);

    await tx.actAs(f.a.clienteAuthId);
    await tx.query(
      `insert into public.mensajes_ticket (org_id, ticket_id, autor_id, autor_rol, cuerpo)
       values ($1, $2, $3, 'cliente', 'sigo con el problema')`,
      [f.a.orgId, f.a.ticketId, f.a.clienteUsuarioId],
    );

    const res = await tx.query(
      "select estado, ultimo_mensaje_en from public.tickets_reclamos where id = $1",
      [f.a.ticketId],
    );
    expect(res.rows[0].estado).toBe("abierto");
    expect(res.rows[0].ultimo_mensaje_en).not.toBeNull();
  });

  it("un mensaje del cliente sobre un ticket CERRADO lo reabre (desviacion deliberada del doc)", async () => {
    await tx.actAs(f.a.clienteAuthId);
    await tx.query("select public.cambiar_estado_mi_ticket($1, 'cerrado')", [f.a.ticketId]);

    await tx.query(
      `insert into public.mensajes_ticket (org_id, ticket_id, autor_id, autor_rol, cuerpo)
       values ($1, $2, $3, 'cliente', 'una cosa mas')`,
      [f.a.orgId, f.a.ticketId, f.a.clienteUsuarioId],
    );

    const res = await tx.query(
      "select estado, cerrado_en from public.tickets_reclamos where id = $1",
      [f.a.ticketId],
    );
    expect(res.rows[0].estado).toBe("abierto");
    expect(res.rows[0].cerrado_en).toBeNull();
  });

  it("un mensaje del operador pasa el ticket a en_proceso; una nota interna NO", async () => {
    await tx.actAs(f.a.operadorAuthId);

    await tx.query(
      `insert into public.mensajes_ticket (org_id, ticket_id, autor_id, autor_rol, cuerpo, es_interno)
       values ($1, $2, $3, 'operador', 'nota para mi', true)`,
      [f.a.orgId, f.a.ticketId, f.a.operadorUsuarioId],
    );
    let res = await tx.query("select estado from public.tickets_reclamos where id = $1", [
      f.a.ticketId,
    ]);
    expect(res.rows[0].estado).toBe("abierto");

    await tx.query(
      `insert into public.mensajes_ticket (org_id, ticket_id, autor_id, autor_rol, cuerpo)
       values ($1, $2, $3, 'operador', 'ya lo estoy viendo')`,
      [f.a.orgId, f.a.ticketId, f.a.operadorUsuarioId],
    );
    res = await tx.query("select estado from public.tickets_reclamos where id = $1", [
      f.a.ticketId,
    ]);
    expect(res.rows[0].estado).toBe("en_proceso");
  });

  it("prioridad_peso es derivada y no se puede escribir a mano", async () => {
    await tx.actAs(f.a.operadorAuthId);
    const res = await tx.query(
      "update public.tickets_reclamos set prioridad = 'alta' where id = $1 returning prioridad_peso",
      [f.a.ticketId],
    );
    expect(res.rows[0].prioridad_peso).toBe(3);

    await expect(
      tx.query("update public.tickets_reclamos set prioridad_peso = 99 where id = $1", [
        f.a.ticketId,
      ]),
    ).rejects.toThrow(/can only be updated to DEFAULT/i);
  });
});

describe("auditoria automatica de tickets (docs/eng/08 §14)", () => {
  let tx: RlsTx;
  let f: TwoOrgFixtures;

  beforeEach(async () => {
    tx = await RlsTx.begin();
    f = await seedTwoOrgs(tx);
  });

  afterEach(async () => {
    await tx.rollback();
  });

  it("[camino feliz] crear un ticket deja 'ticket.alta' con el autor real de la sesion", async () => {
    await tx.actAs(f.a.clienteAuthId);
    const nuevo = await tx.query<{ id: string }>(
      `insert into public.tickets_reclamos (org_id, cliente_id, asunto, tipo)
       values ($1, $2, 'me cobraron de mas', 'reclamo') returning id`,
      [f.a.orgId, f.a.clienteId],
    );

    await tx.actAsPostgres();
    const res = await tx.query(
      "select actor_id, actor_rol, accion, datos from public.audit_log where entidad_id = $1",
      [nuevo.rows[0].id],
    );
    expect(res.rowCount).toBe(1);
    expect(res.rows[0].accion).toBe("ticket.alta");
    expect(res.rows[0].actor_id).toBe(f.a.clienteUsuarioId);
    expect(res.rows[0].actor_rol).toBe("cliente");
    expect((res.rows[0].datos as any).tipo).toBe("reclamo");
  });

  it("el UPDATE directo del operador queda auditado con el antes y el despues", async () => {
    await tx.actAs(f.a.operadorAuthId);
    await tx.query(
      "update public.tickets_reclamos set estado = 'en_proceso', prioridad = 'alta' where id = $1",
      [f.a.ticketId],
    );

    await tx.actAsPostgres();
    const res = await tx.query(
      `select accion, datos, actor_id from public.audit_log
        where entidad_id = $1 and accion like 'ticket.cambio_%' order by accion`,
      [f.a.ticketId],
    );
    expect(res.rows.map((r: any) => r.accion)).toEqual([
      "ticket.cambio_estado",
      "ticket.cambio_prioridad",
    ]);
    expect(res.rows[0].datos).toMatchObject({ antes: "abierto", despues: "en_proceso" });
    expect(res.rows[1].datos).toMatchObject({ antes: "normal", despues: "alta" });
    expect(res.rows[0].actor_id).toBe(f.a.operadorUsuarioId);
  });

  it("un UPDATE que no toca estado ni prioridad NO ensucia la bitacora", async () => {
    await tx.actAs(f.a.operadorAuthId);
    await tx.query("update public.tickets_reclamos set asunto = 'otro asunto' where id = $1", [
      f.a.ticketId,
    ]);

    await tx.actAsPostgres();
    const res = await tx.query(
      `select count(*)::int as n from public.audit_log
        where entidad_id = $1 and accion like 'ticket.cambio_%'`,
      [f.a.ticketId],
    );
    expect(res.rows[0].n).toBe(0);
  });

  it("el cliente sigue sin poder leer audit_log aunque ahora sus tickets se auditen", async () => {
    await tx.actAs(f.a.clienteAuthId);
    await tx.query("select public.cambiar_estado_mi_ticket($1, 'cerrado')", [f.a.ticketId]);
    const res = await tx.query("select id from public.audit_log");
    expect(res.rowCount).toBe(0);
  });
});

describe("RPC marcar_mensajes_leidos", () => {
  let tx: RlsTx;
  let f: TwoOrgFixtures;

  beforeEach(async () => {
    tx = await RlsTx.begin();
    f = await seedTwoOrgs(tx);
  });

  afterEach(async () => {
    await tx.rollback();
  });

  it("el cliente no puede fingir que el operador ya leyo su mensaje", async () => {
    await tx.actAs(f.a.clienteAuthId);
    const res = await tx.query(
      `insert into public.mensajes_ticket
         (org_id, ticket_id, autor_id, autor_rol, cuerpo, leido_por_operador)
       values ($1, $2, $3, 'cliente', 'hola', true)
       returning leido_por_operador, leido_por_cliente`,
      [f.a.orgId, f.a.ticketId, f.a.clienteUsuarioId],
    );
    expect(res.rows[0].leido_por_operador).toBe(false);
    expect(res.rows[0].leido_por_cliente).toBe(true);
  });

  it("[camino feliz] el operador marca leido el hilo y su badge queda en cero", async () => {
    await tx.actAs(f.a.operadorAuthId);
    const n = await tx.query("select public.marcar_mensajes_leidos($1) as n", [f.a.ticketId]);
    expect(n.rows[0].n).toBe(1); // el del cliente; el suyo ya nacio leido

    const pendientes = await tx.query(
      `select count(*)::int as n from public.mensajes_ticket
        where ticket_id = $1 and leido_por_operador = false`,
      [f.a.ticketId],
    );
    expect(pendientes.rows[0].n).toBe(0);
  });

  it("una nota interna jamas cuenta como pendiente para el cliente", async () => {
    await tx.actAs(f.a.clienteAuthId);
    await tx.query("select public.marcar_mensajes_leidos($1)", [f.a.ticketId]);

    await tx.actAsPostgres();
    const interno = await tx.query(
      "select leido_por_cliente from public.mensajes_ticket where id = $1",
      [f.a.mensajeInternoId],
    );
    expect(interno.rows[0].leido_por_cliente).toBe(true);
  });

  it("un ticket de otra org devuelve el mismo error generico que uno inexistente", async () => {
    await tx.actAs(f.a.clienteAuthId);
    const ajeno = await tx.queryExpectingError("select public.marcar_mensajes_leidos($1)", [
      f.b.ticketId,
    ]);
    const inexistente = await tx.queryExpectingError("select public.marcar_mensajes_leidos($1)", [
      "00000000-0000-0000-0000-000000000000",
    ]);
    expect(ajeno.message).toBe(inexistente.message);
    expect(ajeno.message).toMatch(/No encontramos ese ticket/i);
  });

  it("anon no puede ejecutar el RPC", async () => {
    await tx.actAsAnon();
    await expect(
      tx.query("select public.marcar_mensajes_leidos($1)", [f.a.ticketId]),
    ).rejects.toThrow(/permission denied/i);
  });

  it("mensajes_ticket sigue sin UPDATE para authenticated: el RPC es la unica via", async () => {
    await tx.actAs(f.a.operadorAuthId);
    await expect(
      tx.query("update public.mensajes_ticket set cuerpo = 'adulterado' where id = $1", [
        f.a.mensajePublicoId,
      ]),
    ).rejects.toThrow(/permission denied/i);
  });
});

describe("limite de adjuntos por mensaje (docs/eng/08 §7)", () => {
  let tx: RlsTx;
  let f: TwoOrgFixtures;

  beforeEach(async () => {
    tx = await RlsTx.begin();
    f = await seedTwoOrgs(tx);
  });

  afterEach(async () => {
    await tx.rollback();
  });

  const adjunto = (i: number) => ({
    ruta: `x/y/${i}.png`,
    nombre: `captura-${i}.png`,
    mime: "image/png",
    tamano_bytes: 10,
  });

  it("[camino feliz] un mensaje admite hasta 5 adjuntos", async () => {
    await tx.actAs(f.a.clienteAuthId);
    const cinco = [1, 2, 3, 4, 5].map(adjunto);
    const res = await tx.query(
      `insert into public.mensajes_ticket (org_id, ticket_id, autor_id, autor_rol, cuerpo, adjuntos)
       values ($1, $2, $3, 'cliente', 'ahi van las capturas', $4::jsonb) returning id`,
      [f.a.orgId, f.a.ticketId, f.a.clienteUsuarioId, JSON.stringify(cinco)],
    );
    expect(res.rowCount).toBe(1);
  });

  it("el sexto adjunto se rechaza aunque el INSERT venga directo por PostgREST", async () => {
    await tx.actAs(f.a.clienteAuthId);
    const seis = [1, 2, 3, 4, 5, 6].map(adjunto);
    const err = await tx.queryExpectingError(
      `insert into public.mensajes_ticket (org_id, ticket_id, autor_id, autor_rol, cuerpo, adjuntos)
       values ($1, $2, $3, 'cliente', 'demasiadas', $4::jsonb)`,
      [f.a.orgId, f.a.ticketId, f.a.clienteUsuarioId, JSON.stringify(seis)],
    );
    expect(err.message).toMatch(/chk_mensajes_adjuntos/i);
  });

  it("adjuntos tiene que ser un arreglo: un objeto o un numero se rechazan", async () => {
    await tx.actAs(f.a.clienteAuthId);
    for (const valor of ['{"ruta":"x"}', "42"]) {
      const err = await tx.queryExpectingError(
        `insert into public.mensajes_ticket (org_id, ticket_id, autor_id, autor_rol, cuerpo, adjuntos)
         values ($1, $2, $3, 'cliente', 'forma invalida', $4::jsonb)`,
        [f.a.orgId, f.a.ticketId, f.a.clienteUsuarioId, valor],
      );
      expect(err.message).toMatch(/chk_mensajes_adjuntos/i);
    }
  });
});
