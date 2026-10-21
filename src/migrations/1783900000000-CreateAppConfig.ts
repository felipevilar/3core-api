import { MigrationInterface, QueryRunner } from 'typeorm';
import { ROLE_SUPER_ADMIN } from '../auth/permissions.catalog';

const PERMS = [
  {
    key: 'configuracoes.gerenciar',
    label: 'Alterar configurações operacionais',
    feature: 'configuracoes',
  },
];

/**
 * Configurações operacionais da conta (flags que mudam o comportamento do
 * fluxo de chamados: RAT/assinatura/geolocalização obrigatórias, expiração
 * de solicitações etc.). Linha única (id = 1), como `financeiro_config`.
 */
export class CreateAppConfig1783900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "app_config" (
         "id"                        INT PRIMARY KEY DEFAULT 1 CHECK ("id" = 1),
         "ratObrigatoria"            BOOLEAN NOT NULL DEFAULT false,
         "assinaturaObrigatoria"     BOOLEAN NOT NULL DEFAULT false,
         "geolocalizacaoObrigatoria" BOOLEAN NOT NULL DEFAULT false,
         "avaliacaoHabilitada"       BOOLEAN NOT NULL DEFAULT true,
         "solicitacaoExpiraHoras"    INT,
         "permitirAgendarNoPassado"  BOOLEAN NOT NULL DEFAULT true,
         "updatedByUserId"           INT,
         "updatedAt"                 TIMESTAMPTZ NOT NULL DEFAULT now()
       )`,
    );
    await queryRunner.query(
      `INSERT INTO "app_config" ("id") VALUES (1) ON CONFLICT ("id") DO NOTHING`,
    );

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
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "permissions" WHERE "key" = ANY($1::text[])`,
      [PERMS.map((p) => p.key)],
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "app_config"`);
  }
}
