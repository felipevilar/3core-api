import { MigrationInterface, QueryRunner } from 'typeorm';
import { ROLE_SUPER_ADMIN } from '../auth/permissions.catalog';

const PERMS = [
  {
    key: 'agenda.ver',
    label: 'Ver agenda (calendário de atendimentos)',
    feature: 'agenda',
  },
  {
    key: 'agenda.gerenciar',
    label: 'Reagendar atendimentos pela agenda',
    feature: 'agenda',
  },
];

/**
 * Módulo Agenda: cria as permissões `agenda.ver` / `agenda.gerenciar`, concede
 * ambas ao super_admin e indexa `chamados.agendadoPara` (a agenda consulta por
 * intervalo de datas nessa coluna). Idempotente.
 */
export class AddAgendaModule1783500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const perm of PERMS) {
      await queryRunner.query(
        `INSERT INTO "permissions" ("key", "label", "feature")
         VALUES ($1, $2, $3)
         ON CONFLICT ("key") DO NOTHING`,
        [perm.key, perm.label, perm.feature],
      );
      await queryRunner.query(
        `INSERT INTO "role_permissions" ("roleId", "permissionId")
         SELECT r."id", p."id"
         FROM "roles" r, "permissions" p
         WHERE r."name" = $1 AND p."key" = $2
         ON CONFLICT DO NOTHING`,
        [ROLE_SUPER_ADMIN, perm.key],
      );
    }

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_chamados_agendadoPara"
       ON "chamados" ("agendadoPara")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_chamados_agendadoPara"`);
    await queryRunner.query(
      `DELETE FROM "permissions" WHERE "key" = ANY($1::text[])`,
      [PERMS.map((p) => p.key)],
    );
  }
}
