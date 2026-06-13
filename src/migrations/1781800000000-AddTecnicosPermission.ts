import { MigrationInterface, QueryRunner } from 'typeorm';
import { ROLE_SUPER_ADMIN } from '../auth/permissions.catalog';

const TECNICOS_VER = {
  key: 'tecnicos.ver',
  label: 'Ver técnicos (lista e ficha)',
  feature: 'tecnicos',
};

/**
 * Adiciona a permissão `tecnicos.ver` (menu/ficha de técnicos no dashboard) e a
 * concede ao papel `super_admin`. Demais papéis recebem via UI de Papéis.
 */
export class AddTecnicosPermission1781800000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Idempotente: não duplica se a permissão já existir.
    await queryRunner.query(
      `INSERT INTO "permissions" ("key", "label", "feature")
       VALUES ($1, $2, $3)
       ON CONFLICT ("key") DO NOTHING`,
      [TECNICOS_VER.key, TECNICOS_VER.label, TECNICOS_VER.feature],
    );

    // Concede ao super_admin (acesso total).
    await queryRunner.query(
      `INSERT INTO "role_permissions" ("roleId", "permissionId")
       SELECT r."id", p."id"
       FROM "roles" r, "permissions" p
       WHERE r."name" = $1 AND p."key" = $2
       ON CONFLICT DO NOTHING`,
      [ROLE_SUPER_ADMIN, TECNICOS_VER.key],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // O vínculo em role_permissions cai por ON DELETE CASCADE ao remover a permissão.
    await queryRunner.query(`DELETE FROM "permissions" WHERE "key" = $1`, [
      TECNICOS_VER.key,
    ]);
  }
}
