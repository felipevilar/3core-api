import { MigrationInterface, QueryRunner } from 'typeorm';
import { ROLE_TECNICO } from '../auth/permissions.catalog';

const MISSING_KEYS = ['atendimentos.editar', 'atendimentos.ver_historico'];

export class FixTecnicoMissingPermissions1782900000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT INTO "role_permissions" ("roleId", "permissionId")
       SELECT r."id", p."id"
       FROM "roles" r, "permissions" p
       WHERE r."name" = $1 AND p."key" = ANY($2)
       ON CONFLICT DO NOTHING`,
      [ROLE_TECNICO, MISSING_KEYS],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "role_permissions"
       WHERE "roleId" = (SELECT id FROM "roles" WHERE name = $1)
         AND "permissionId" IN (
           SELECT id FROM "permissions" WHERE key = ANY($2)
         )`,
      [ROLE_TECNICO, MISSING_KEYS],
    );
  }
}
