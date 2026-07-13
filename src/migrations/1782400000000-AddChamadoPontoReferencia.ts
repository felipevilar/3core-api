import { MigrationInterface, QueryRunner } from 'typeorm';

/** Adiciona o campo de ponto de referência ao endereço do chamado. */
export class AddChamadoPontoReferencia1782400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "chamados" ADD COLUMN "pontoReferencia" VARCHAR`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "chamados" DROP COLUMN "pontoReferencia"`,
    );
  }
}
