import { MigrationInterface, QueryRunner } from 'typeorm';
import { ROLE_SUPER_ADMIN, ROLE_TECNICO } from '../auth/permissions.catalog';

const NEW_PERMISSIONS = [
  {
    key: 'atendimentos.ver_historico',
    label: 'Ver histórico do atendimento',
    feature: 'atendimentos',
  },
];

const SUPER_ADMIN_KEYS = NEW_PERMISSIONS.map((p) => p.key);
const TECNICO_KEYS = ['atendimentos.ver_historico'];

export class AddChamadoVerHistoricoPermission1782700000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const p of NEW_PERMISSIONS) {
      await queryRunner.query(
        `INSERT INTO "permissions" ("key", "label", "feature")
         VALUES ($1, $2, $3)
         ON CONFLICT ("key") DO NOTHING`,
        [p.key, p.label, p.feature],
      );
    }

    await queryRunner.query(
      `INSERT INTO "role_permissions" ("roleId", "permissionId")
       SELECT r."id", p."id"
       FROM "roles" r, "permissions" p
       WHERE r."name" = $1 AND p."key" = ANY($2)
       ON CONFLICT DO NOTHING`,
      [ROLE_SUPER_ADMIN, SUPER_ADMIN_KEYS],
    );

    await queryRunner.query(
      `INSERT INTO "role_permissions" ("roleId", "permissionId")
       SELECT r."id", p."id"
       FROM "roles" r, "permissions" p
       WHERE r."name" = $1 AND p."key" = ANY($2)
       ON CONFLICT DO NOTHING`,
      [ROLE_TECNICO, TECNICO_KEYS],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "permissions" WHERE "key" = ANY($1)`, [
      SUPER_ADMIN_KEYS,
    ]);
  }
}
