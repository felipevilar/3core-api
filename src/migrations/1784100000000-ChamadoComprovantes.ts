import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Comprovantes do repasse ao técnico anexados pelo financeiro após o pagamento.
 * Mesmo desenho de chamado_rats (metadados; o arquivo fica no Storage).
 */
export class ChamadoComprovantes1784100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "chamado_comprovantes" (
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
    await queryRunner.query(
      `CREATE INDEX "IDX_comprovantes_chamadoId" ON "chamado_comprovantes" ("chamadoId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "chamado_comprovantes"`);
  }
}
