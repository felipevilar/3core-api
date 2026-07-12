import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tabelas do módulo de chamados (atendimentos) + financeiro:
 * chamados (raiz), chamado_line_items (financeiro), chamado_events (auditoria
 * append-only) e chamado_rats (anexos). Uma SEQUENCE dedicada gera o código
 * humano sem corrida.
 */
export class CreateChamadosTables1782200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SEQUENCE IF NOT EXISTS "chamados_codigo_seq"`);

    await queryRunner.query(`
      CREATE TABLE "chamados" (
        "id"                  SERIAL PRIMARY KEY,
        "codigo"              VARCHAR NOT NULL UNIQUE,
        "clientId"            INT NOT NULL REFERENCES "clients"("id") ON DELETE RESTRICT,
        "cityCode"            INT REFERENCES "cities"("code") ON DELETE SET NULL,
        "cep"                 VARCHAR,
        "logradouro"          VARCHAR,
        "numero"              VARCHAR,
        "complemento"         VARCHAR,
        "bairro"              VARCHAR,
        "titulo"              VARCHAR NOT NULL,
        "descricao"           TEXT,
        "prioridade"          VARCHAR NOT NULL DEFAULT 'media',
        "status"              VARCHAR NOT NULL DEFAULT 'aberto',
        "agendadoPara"        TIMESTAMPTZ,
        "tecnicoUserId"       INT REFERENCES "users"("id") ON DELETE SET NULL,
        "techProfileId"       INT,
        "snapTecnicoNome"     VARCHAR,
        "snapTecnicoEmail"    VARCHAR,
        "atribuidoEm"         TIMESTAMPTZ,
        "aCaminhoEm"          TIMESTAMPTZ,
        "chegadaEm"           TIMESTAMPTZ,
        "finalizadoEm"        TIMESTAMPTZ,
        "fechadoEm"           TIMESTAMPTZ,
        "canceladoEm"         TIMESTAMPTZ,
        "reabertoEm"          TIMESTAMPTZ,
        "motivoCancelamento"  TEXT,
        "motivoReabertura"    TEXT,
        "snapValorHora"       NUMERIC(12,2),
        "snapCustoPorKm"      NUMERIC(12,2),
        "snapCustoKmCidade"   NUMERIC(12,2),
        "horasTrabalhadas"    NUMERIC(6,2),
        "kmDeslocamento"      NUMERIC(10,2),
        "custoTecnicoTotal"   NUMERIC(12,2) NOT NULL DEFAULT 0,
        "valorClienteTotal"   NUMERIC(12,2) NOT NULL DEFAULT 0,
        "valoresCongeladosEm" TIMESTAMPTZ,
        "paymentStatus"       VARCHAR NOT NULL DEFAULT 'nao_aplicavel',
        "paymentPeriodo"      CHAR(7),
        "aprovadoEm"          TIMESTAMPTZ,
        "pagoEm"              TIMESTAMPTZ,
        "financeiroObs"       TEXT,
        "createdByUserId"     INT REFERENCES "users"("id") ON DELETE SET NULL,
        "version"             INT NOT NULL DEFAULT 1,
        "createdAt"           TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt"           TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_chamados_status" ON "chamados" ("status")`);
    await queryRunner.query(`CREATE INDEX "IDX_chamados_clientId" ON "chamados" ("clientId")`);
    await queryRunner.query(`CREATE INDEX "IDX_chamados_tecnicoUserId" ON "chamados" ("tecnicoUserId")`);
    await queryRunner.query(`CREATE INDEX "IDX_chamados_paymentStatus" ON "chamados" ("paymentStatus")`);
    await queryRunner.query(`CREATE INDEX "IDX_chamados_paymentPeriodo" ON "chamados" ("paymentPeriodo")`);

    await queryRunner.query(`
      CREATE TABLE "chamado_line_items" (
        "id"              SERIAL PRIMARY KEY,
        "chamadoId"       INT NOT NULL REFERENCES "chamados"("id") ON DELETE CASCADE,
        "natureza"        VARCHAR NOT NULL,
        "tipo"            VARCHAR NOT NULL,
        "descricao"       VARCHAR,
        "quantidade"      NUMERIC(12,2) NOT NULL DEFAULT 1,
        "valorUnitario"   NUMERIC(12,2) NOT NULL DEFAULT 0,
        "valorTotal"      NUMERIC(12,2) NOT NULL,
        "origem"          VARCHAR NOT NULL DEFAULT 'manual',
        "createdByUserId" INT REFERENCES "users"("id") ON DELETE SET NULL,
        "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_line_items_chamadoId" ON "chamado_line_items" ("chamadoId")`);

    await queryRunner.query(`
      CREATE TABLE "chamado_events" (
        "id"             SERIAL PRIMARY KEY,
        "chamadoId"      INT NOT NULL REFERENCES "chamados"("id") ON DELETE CASCADE,
        "tipo"           VARCHAR NOT NULL,
        "statusAnterior" VARCHAR,
        "statusNovo"     VARCHAR,
        "atorUserId"     INT REFERENCES "users"("id") ON DELETE SET NULL,
        "atorRole"       VARCHAR,
        "atorEmail"      VARCHAR,
        "nota"           TEXT,
        "metadata"       JSONB,
        "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_events_chamadoId" ON "chamado_events" ("chamadoId")`);

    await queryRunner.query(`
      CREATE TABLE "chamado_rats" (
        "id"               SERIAL PRIMARY KEY,
        "chamadoId"        INT NOT NULL REFERENCES "chamados"("id") ON DELETE CASCADE,
        "storagePath"      VARCHAR NOT NULL,
        "fileName"         VARCHAR NOT NULL,
        "mimeType"         VARCHAR,
        "sizeBytes"        INT,
        "observacoes"      TEXT,
        "uploadedByUserId" INT REFERENCES "users"("id") ON DELETE SET NULL,
        "createdAt"        TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_rats_chamadoId" ON "chamado_rats" ("chamadoId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "chamado_rats"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "chamado_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "chamado_line_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "chamados"`);
    await queryRunner.query(`DROP SEQUENCE IF EXISTS "chamados_codigo_seq"`);
  }
}
