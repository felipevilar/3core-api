import { MigrationInterface, QueryRunner } from 'typeorm';
import { ROLE_SUPER_ADMIN, ROLE_TECNICO } from '../auth/permissions.catalog';

const NEW_PERMISSIONS = [
  {
    key: 'atendimentos.gerenciar',
    label: 'Gerenciar atendimentos (atribuir, fechar, reabrir, cancelar)',
    feature: 'atendimentos',
  },
  {
    key: 'financeiro.ver',
    label: 'Ver financeiro (custos, receita, margem, folha de todos)',
    feature: 'financeiro',
  },
  {
    key: 'financeiro.gerenciar',
    label: 'Gerenciar financeiro (linhas, aprovar, marcar pago)',
    feature: 'financeiro',
  },
  {
    key: 'financeiro.ver_proprio',
    label: 'Ver os próprios ganhos (técnico)',
    feature: 'financeiro',
  },
];

/** Chaves concedidas a cada papel de sistema nesta migration. */
const SUPER_ADMIN_KEYS = NEW_PERMISSIONS.map((p) => p.key);
const TECNICO_KEYS = ['financeiro.ver_proprio'];

/**
 * Adiciona as permissões do módulo de chamados/financeiro e as concede aos
 * papéis de sistema (super_admin: todas; tecnico: só ver os próprios ganhos).
 * Idempotente.
 */
export class AddChamadosFinanceiroPermissions1782300000000
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
