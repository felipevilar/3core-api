import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Imposto sobre nota fiscal (ISS) — abatido da receita bruta do chamado.
 *
 *  - `financeiro_config`: linha única (id = 1) com a alíquota vigente da
 *    empresa. Muda com frequência; vale para todos os chamados NÃO fechados.
 *  - `clients.emiteNotaFiscal`: padrão do cliente (alguns não pedem nota).
 *  - `chamados`:
 *      emiteNota              — herdado do cliente na criação, ajustável;
 *      aliquotaImpostoManual  — alíquota específica do chamado (null = vigente);
 *      aliquotaImposto        — alíquota efetivamente aplicada (materializada);
 *      impostoTotal           — receita bruta × alíquota, congelado no fechamento.
 *
 * Chamados já fechados ficam sem imposto (emiteNota = false) para não alterar o
 * histórico; os demais herdam o padrão do cliente. Idempotente.
 */
export class AddImpostoNotaFiscal1783600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "financeiro_config" (
         "id" INT PRIMARY KEY DEFAULT 1 CHECK ("id" = 1),
         "aliquotaImposto" NUMERIC(5,2) NOT NULL DEFAULT 0,
         "updatedByUserId" INT,
         "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
       )`,
    );
    await queryRunner.query(
      `INSERT INTO "financeiro_config" ("id") VALUES (1)
       ON CONFLICT ("id") DO NOTHING`,
    );

    await queryRunner.query(
      `ALTER TABLE "clients"
       ADD COLUMN IF NOT EXISTS "emiteNotaFiscal" BOOLEAN NOT NULL DEFAULT true`,
    );

    await queryRunner.query(
      `ALTER TABLE "chamados"
       ADD COLUMN IF NOT EXISTS "emiteNota" BOOLEAN NOT NULL DEFAULT false,
       ADD COLUMN IF NOT EXISTS "aliquotaImpostoManual" NUMERIC(5,2),
       ADD COLUMN IF NOT EXISTS "aliquotaImposto" NUMERIC(5,2) NOT NULL DEFAULT 0,
       ADD COLUMN IF NOT EXISTS "impostoTotal" NUMERIC(12,2) NOT NULL DEFAULT 0`,
    );
    // Chamados em aberto herdam o padrão do cliente. A alíquota vigente nasce
    // 0, então nenhum valor muda até o admin configurá-la.
    await queryRunner.query(
      `UPDATE "chamados" c
       SET "emiteNota" = cl."emiteNotaFiscal"
       FROM "clients" cl
       WHERE c."clientId" = cl."id" AND c."valoresCongeladosEm" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "chamados"
       DROP COLUMN IF EXISTS "impostoTotal",
       DROP COLUMN IF EXISTS "aliquotaImposto",
       DROP COLUMN IF EXISTS "aliquotaImpostoManual",
       DROP COLUMN IF EXISTS "emiteNota"`,
    );
    await queryRunner.query(
      `ALTER TABLE "clients" DROP COLUMN IF EXISTS "emiteNotaFiscal"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "financeiro_config"`);
  }
}
