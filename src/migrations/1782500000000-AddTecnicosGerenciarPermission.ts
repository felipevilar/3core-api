import { MigrationInterface, QueryRunner } from 'typeorm';
import { ROLE_SUPER_ADMIN } from '../auth/permissions.catalog';

const PERM = {
  key: 'tecnicos.gerenciar',
  label: 'Gerenciar técnicos (criar, editar, ativar/excluir)',
  feature: 'tecnicos',
};

/**
 * Adiciona a permissão `tecnicos.gerenciar` (CRUD de técnicos pelo dashboard)
 * e a concede ao super_admin. Idempotente.
 */
export class AddTecnicosGerenciarPermission1782500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT INTO "permissions" ("key", "label", "feature")
       VALUES ($1, $2, $3)
       ON CONFLICT ("key") DO NOTHING`,
      [PERM.key, PERM.label, PERM.feature],
    );
    await queryRunner.query(
      `INSERT INTO "role_permissions" ("roleId", "permissionId")
       SELECT r."id", p."id"
       FROM "roles" r, "permissions" p
       WHERE r."name" = $1 AND p."key" = $2
       ON CONFLICT DO NOTHING`,
      [ROLE_SUPER_ADMIN, PERM.key],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "permissions" WHERE "key" = $1`, [
      PERM.key,
    ]);
  }
}
