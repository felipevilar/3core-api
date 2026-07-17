import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddChamadoNumerosExternoInterno1782600000000
  implements MigrationInterface
{
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE chamados ADD COLUMN IF NOT EXISTS "chamadoInterno" varchar`,
    );
    await queryRunner.query(
      `ALTER TABLE chamados ADD COLUMN IF NOT EXISTS "chamadoExterno" varchar`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE chamados DROP COLUMN IF EXISTS "chamadoExterno"`,
    );
    await queryRunner.query(
      `ALTER TABLE chamados DROP COLUMN IF EXISTS "chamadoInterno"`,
    );
  }
}
