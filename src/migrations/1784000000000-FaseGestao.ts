import { MigrationInterface, QueryRunner } from 'typeorm';
import { ROLE_SUPER_ADMIN } from '../auth/permissions.catalog';

const PERMS = [
  {
    key: 'servicos.ver',
    label: 'Ver catálogo de serviços',
    feature: 'servicos',
  },
  {
    key: 'servicos.gerenciar',
    label: 'Gerenciar catálogo de serviços',
    feature: 'servicos',
  },
];

/**
 * Fase de gestão do field service:
 *  - `sla_politicas` + prazos/flags de SLA no chamado (1ª visita e conclusão);
 *  - `servicos` (catálogo com duração padrão e valor sugerido) + `chamados.servicoId`;
 *  - `motivos` classificados (cancelamento/recusa/reabertura/pausa) referenciados
 *    pelo chamado, pela visita e pelas pausas;
 *  - `chamado_comentarios` (thread por chamado);
 *  - `notificacoes` in-app por usuário;
 *  - `chamados.arquivadoEm` (arquivar encerrados).
 */
export class FaseGestao1784000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---- SLA ----
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "sla_politicas" (
        "id"                  SERIAL PRIMARY KEY,
        "nome"                VARCHAR NOT NULL,
        "clientId"            INT REFERENCES "clients"("id") ON DELETE CASCADE,
        "prioridade"          VARCHAR,
        "horasPrimeiraVisita" INT,
        "horasConclusao"      INT,
        "ativo"               BOOLEAN NOT NULL DEFAULT true,
        "createdAt"           TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt"           TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_sla_politicas_clientId" ON "sla_politicas" ("clientId")`,
    );

    // ---- Catálogo de serviços ----
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "servicos" (
        "id"                   SERIAL PRIMARY KEY,
        "nome"                 VARCHAR NOT NULL,
        "descricao"            TEXT,
        "duracaoPadraoMin"     INT,
        "valorSugeridoCliente" NUMERIC(12,2),
        "ativo"                BOOLEAN NOT NULL DEFAULT true,
        "createdAt"            TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt"            TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    // ---- Motivos classificados ----
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "motivos" (
        "id"     SERIAL PRIMARY KEY,
        "tipo"   VARCHAR NOT NULL,
        "nome"   VARCHAR NOT NULL,
        "ordem"  INT NOT NULL DEFAULT 0,
        "ativo"  BOOLEAN NOT NULL DEFAULT true
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_motivos_tipo" ON "motivos" ("tipo")`,
    );

    // ---- Chamado: SLA, serviço, motivo, arquivo ----
    await queryRunner.query(
      `ALTER TABLE "chamados"
       ADD COLUMN IF NOT EXISTS "slaPoliticaId" INT REFERENCES "sla_politicas"("id") ON DELETE SET NULL,
       ADD COLUMN IF NOT EXISTS "prazoPrimeiraVisita" TIMESTAMPTZ,
       ADD COLUMN IF NOT EXISTS "prazoConclusao" TIMESTAMPTZ,
       ADD COLUMN IF NOT EXISTS "primeiraVisitaEm" TIMESTAMPTZ,
       ADD COLUMN IF NOT EXISTS "slaPrimeiraVisitaViolado" BOOLEAN NOT NULL DEFAULT false,
       ADD COLUMN IF NOT EXISTS "slaConclusaoViolado" BOOLEAN NOT NULL DEFAULT false,
       ADD COLUMN IF NOT EXISTS "slaAlertaEnviadoEm" TIMESTAMPTZ,
       ADD COLUMN IF NOT EXISTS "servicoId" INT REFERENCES "servicos"("id") ON DELETE SET NULL,
       ADD COLUMN IF NOT EXISTS "motivoCancelamentoId" INT REFERENCES "motivos"("id") ON DELETE SET NULL,
       ADD COLUMN IF NOT EXISTS "arquivadoEm" TIMESTAMPTZ`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_chamados_prazoConclusao" ON "chamados" ("prazoConclusao")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_chamados_arquivadoEm" ON "chamados" ("arquivadoEm")`,
    );
    await queryRunner.query(
      `ALTER TABLE "chamado_visitas"
       ADD COLUMN IF NOT EXISTS "motivoId" INT REFERENCES "motivos"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "chamado_visita_pausas"
       ADD COLUMN IF NOT EXISTS "motivoId" INT REFERENCES "motivos"("id") ON DELETE SET NULL`,
    );

    // ---- Comentários ----
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "chamado_comentarios" (
        "id"          SERIAL PRIMARY KEY,
        "chamadoId"   INT NOT NULL REFERENCES "chamados"("id") ON DELETE CASCADE,
        "autorUserId" INT REFERENCES "users"("id") ON DELETE SET NULL,
        "autorNome"   VARCHAR,
        "texto"       TEXT NOT NULL,
        "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt"   TIMESTAMPTZ
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_chamado_comentarios_chamadoId" ON "chamado_comentarios" ("chamadoId")`,
    );

    // ---- Notificações in-app ----
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "notificacoes" (
        "id"        SERIAL PRIMARY KEY,
        "userId"    INT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "tipo"      VARCHAR NOT NULL,
        "titulo"    VARCHAR NOT NULL,
        "corpo"     TEXT,
        "link"      VARCHAR,
        "lidaEm"    TIMESTAMPTZ,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_notificacoes_user_lida" ON "notificacoes" ("userId", "lidaEm")`,
    );

    // ---- Permissões ----
    for (const perm of PERMS) {
      await queryRunner.query(
        `INSERT INTO "permissions" ("key", "label", "feature")
         VALUES ($1, $2, $3)
         ON CONFLICT ("key") DO NOTHING`,
        [perm.key, perm.label, perm.feature],
      );
      await queryRunner.query(
        `INSERT INTO "role_permissions" ("roleId", "permissionId")
         SELECT r."id", p."id"
         FROM "roles" r, "permissions" p
         WHERE r."name" = $1 AND p."key" = $2
         ON CONFLICT DO NOTHING`,
        [ROLE_SUPER_ADMIN, perm.key],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "permissions" WHERE "key" = ANY($1::text[])`,
      [PERMS.map((p) => p.key)],
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "notificacoes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "chamado_comentarios"`);
    await queryRunner.query(
      `ALTER TABLE "chamado_visita_pausas" DROP COLUMN IF EXISTS "motivoId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "chamado_visitas" DROP COLUMN IF EXISTS "motivoId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "chamados"
       DROP COLUMN IF EXISTS "arquivadoEm",
       DROP COLUMN IF EXISTS "motivoCancelamentoId",
       DROP COLUMN IF EXISTS "servicoId",
       DROP COLUMN IF EXISTS "slaAlertaEnviadoEm",
       DROP COLUMN IF EXISTS "slaConclusaoViolado",
       DROP COLUMN IF EXISTS "slaPrimeiraVisitaViolado",
       DROP COLUMN IF EXISTS "primeiraVisitaEm",
       DROP COLUMN IF EXISTS "prazoConclusao",
       DROP COLUMN IF EXISTS "prazoPrimeiraVisita",
       DROP COLUMN IF EXISTS "slaPoliticaId"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "motivos"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "servicos"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sla_politicas"`);
  }
}
