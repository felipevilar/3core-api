import { MigrationInterface, QueryRunner } from 'typeorm';
import { ROLE_SUPER_ADMIN, ROLE_TECNICO } from '../auth/permissions.catalog';

/**
 * Introduz o fluxo de "Solicitações":
 * - nova permissão `atendimentos.ver_solicitacoes` (menu + aceitar/recusar/executar);
 * - concede a super_admin e tecnico; remove `atendimentos.editar` do tecnico;
 * - migra dados: chamados `atribuido` ainda NÃO aceitos viram `solicitado`
 *   (baseado na coluna legada `aceitoPeloTecnico`, se existir);
 * - remove a coluna legada `aceitoPeloTecnico`.
 */
export class AddSolicitadoStatusAndVerSolicitacoes1783000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1) Nova permissão.
    await queryRunner.query(
      `INSERT INTO "permissions" ("key", "label", "feature")
       VALUES ($1, $2, $3)
       ON CONFLICT ("key") DO NOTHING`,
      [
        'atendimentos.ver_solicitacoes',
        'Ver e responder solicitações (aceitar/recusar, executar)',
        'atendimentos',
      ],
    );

    // 2) Concede a super_admin e tecnico.
    await queryRunner.query(
      `INSERT INTO "role_permissions" ("roleId", "permissionId")
       SELECT r."id", p."id"
       FROM "roles" r, "permissions" p
       WHERE r."name" = ANY($1) AND p."key" = $2
       ON CONFLICT DO NOTHING`,
      [[ROLE_SUPER_ADMIN, ROLE_TECNICO], 'atendimentos.ver_solicitacoes'],
    );

    // 3) Remove `atendimentos.editar` do papel tecnico (fica só com ver_solicitacoes).
    await queryRunner.query(
      `DELETE FROM "role_permissions" rp
       USING "roles" r, "permissions" p
       WHERE rp."roleId" = r."id" AND rp."permissionId" = p."id"
         AND r."name" = $1 AND p."key" = $2`,
      [ROLE_TECNICO, 'atendimentos.editar'],
    );

    // 4) Migra dados: chamados atribuídos ainda não aceitos -> solicitado.
    //    A coluna `aceitoPeloTecnico` pode não existir (bancos novos); protege com IF.
    const hasCol: { exists: boolean }[] = await queryRunner.query(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_name = 'chamados' AND column_name = 'aceitoPeloTecnico'
       ) AS exists`,
    );
    if (hasCol[0]?.exists) {
      await queryRunner.query(
        `UPDATE "chamados"
         SET "status" = 'solicitado'
         WHERE "status" = 'atribuido' AND "aceitoPeloTecnico" IS NOT TRUE`,
      );
      await queryRunner.query(
        `ALTER TABLE "chamados" DROP COLUMN "aceitoPeloTecnico"`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Recria a coluna legada e reconstitui seu valor a partir do status.
    await queryRunner.query(
      `ALTER TABLE "chamados" ADD COLUMN IF NOT EXISTS "aceitoPeloTecnico" boolean DEFAULT NULL`,
    );
    // atribuido = aceito (true); solicitado = pendente (null) e volta a atribuido.
    await queryRunner.query(
      `UPDATE "chamados" SET "aceitoPeloTecnico" = true WHERE "status" = 'atribuido'`,
    );
    await queryRunner.query(
      `UPDATE "chamados" SET "status" = 'atribuido', "aceitoPeloTecnico" = NULL
       WHERE "status" = 'solicitado'`,
    );

    // Restaura `atendimentos.editar` no tecnico.
    await queryRunner.query(
      `INSERT INTO "role_permissions" ("roleId", "permissionId")
       SELECT r."id", p."id"
       FROM "roles" r, "permissions" p
       WHERE r."name" = $1 AND p."key" = $2
       ON CONFLICT DO NOTHING`,
      [ROLE_TECNICO, 'atendimentos.editar'],
    );

    // Remove a permissão nova.
    await queryRunner.query(`DELETE FROM "permissions" WHERE "key" = $1`, [
      'atendimentos.ver_solicitacoes',
    ]);
  }
}
