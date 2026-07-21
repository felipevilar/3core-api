import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddChamadoAceitoPeloTecnico1782800000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "chamados" ADD COLUMN IF NOT EXISTS "aceitoPeloTecnico" boolean DEFAULT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "chamados" DROP COLUMN IF EXISTS "aceitoPeloTecnico"`,
    );
  }
}
