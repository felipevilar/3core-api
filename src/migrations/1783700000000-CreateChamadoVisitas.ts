import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Visitas (execuções em campo) de um chamado — modelo Order 1:N Task.
 *
 * O chamado passa a ser a OS; a máquina de estados de execução (solicitado →
 * atribuido → a_caminho → em_atendimento ⇄ pausado → finalizado | cancelado)
 * vive em `chamado_visitas`. O chamado projeta o status da visita atual
 * (`visitaAtualId`) e mantém `fechado`/`cancelado` como estados próprios.
 *
 * Os dados existentes são de teste: as tabelas de chamados são limpas para
 * não deixar chamados sem visita. Sem backfill.
 */
export class CreateChamadoVisitas1783700000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `TRUNCATE "chamado_events", "chamado_line_items", "chamado_rats", "chamados" RESTART IDENTITY CASCADE`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "chamado_visitas" (
        "id"                   SERIAL PRIMARY KEY,
        "chamadoId"            INT NOT NULL REFERENCES "chamados"("id") ON DELETE CASCADE,
        "numero"               INT NOT NULL,
        "status"               VARCHAR NOT NULL DEFAULT 'solicitado',
        "tecnicoUserId"        INT REFERENCES "users"("id") ON DELETE SET NULL,
        "techProfileId"        INT,
        "snapTecnicoNome"      VARCHAR,
        "snapTecnicoEmail"     VARCHAR,
        "snapValorHora"        NUMERIC(12,2),
        "snapCustoPorKm"       NUMERIC(12,2),
        "snapCustoKmCidade"    NUMERIC(12,2),
        "agendadoPara"         TIMESTAMPTZ,
        "duracaoPrevistaMin"   INT,
        "ordemRota"            INT,
        "solicitacaoExpiraEm"  TIMESTAMPTZ,
        "atribuidoEm"          TIMESTAMPTZ,
        "aceitoEm"             TIMESTAMPTZ,
        "visualizadoEm"        TIMESTAMPTZ,
        "aCaminhoEm"           TIMESTAMPTZ,
        "chegadaEm"            TIMESTAMPTZ,
        "finalizadoEm"         TIMESTAMPTZ,
        "canceladoEm"          TIMESTAMPTZ,
        "motivoCancelamento"   TEXT,
        "horasTrabalhadas"     NUMERIC(6,2),
        "kmDeslocamento"       NUMERIC(10,2),
        "observacao"           TEXT,
        "aCaminhoLat"          DOUBLE PRECISION,
        "aCaminhoLng"          DOUBLE PRECISION,
        "chegadaLat"           DOUBLE PRECISION,
        "chegadaLng"           DOUBLE PRECISION,
        "chegadaPrecisaoM"     DOUBLE PRECISION,
        "chegadaDistanciaM"    DOUBLE PRECISION,
        "finalizadoLat"        DOUBLE PRECISION,
        "finalizadoLng"        DOUBLE PRECISION,
        "assinaturaPath"       VARCHAR,
        "assinadoPor"          VARCHAR,
        "assinadoDoc"          VARCHAR,
        "assinadoEm"           TIMESTAMPTZ,
        "avaliacaoNota"        SMALLINT,
        "avaliacaoComentario"  TEXT,
        "createdByUserId"      INT REFERENCES "users"("id") ON DELETE SET NULL,
        "createdAt"            TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt"            TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_chamado_visitas_chamado_numero" UNIQUE ("chamadoId", "numero")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_chamado_visitas_chamadoId" ON "chamado_visitas" ("chamadoId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_chamado_visitas_tecnicoUserId" ON "chamado_visitas" ("tecnicoUserId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_chamado_visitas_agendadoPara" ON "chamado_visitas" ("agendadoPara")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_chamado_visitas_status" ON "chamado_visitas" ("status")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "chamado_visita_pausas" (
        "id"              SERIAL PRIMARY KEY,
        "visitaId"        INT NOT NULL REFERENCES "chamado_visitas"("id") ON DELETE CASCADE,
        "inicioEm"        TIMESTAMPTZ NOT NULL DEFAULT now(),
        "fimEm"           TIMESTAMPTZ,
        "motivo"          TEXT,
        "createdByUserId" INT REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_chamado_visita_pausas_visitaId" ON "chamado_visita_pausas" ("visitaId")`,
    );

    await queryRunner.query(
      `ALTER TABLE "chamados"
       ADD COLUMN IF NOT EXISTS "visitaAtualId" INT REFERENCES "chamado_visitas"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "chamado_line_items"
       ADD COLUMN IF NOT EXISTS "visitaId" INT REFERENCES "chamado_visitas"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_chamado_line_items_visitaId" ON "chamado_line_items" ("visitaId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "chamado_line_items" DROP COLUMN IF EXISTS "visitaId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "chamados" DROP COLUMN IF EXISTS "visitaAtualId"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "chamado_visita_pausas"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "chamado_visitas"`);
  }
}
