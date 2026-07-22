import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Recebimento do cliente — ciclo SEPARADO do pagamento ao técnico.
 *
 * `paymentStatus` já modela quanto/quando pagamos o TÉCNICO. Falta o outro lado:
 * se o CLIENTE já nos pagou a receita do chamado. Sem isso não dá para calcular
 * "Pendente a Receber" nem "Saldo Já Realizado" no painel financeiro.
 *
 * `clientePaymentStatus` só tem significado em chamados fechados (receita
 * congelada); nos demais carrega o default e é ignorado nas agregações.
 */
export class AddChamadoClientePayment1783100000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "chamados"
       ADD COLUMN IF NOT EXISTS "clientePaymentStatus" VARCHAR NOT NULL DEFAULT 'pendente',
       ADD COLUMN IF NOT EXISTS "clientePagoEm" TIMESTAMPTZ`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_chamados_clientePaymentStatus"
       ON "chamados" ("clientePaymentStatus")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_chamados_clientePaymentStatus"`,
    );
    await queryRunner.query(
      `ALTER TABLE "chamados"
       DROP COLUMN IF EXISTS "clientePagoEm",
       DROP COLUMN IF EXISTS "clientePaymentStatus"`,
    );
  }
}
