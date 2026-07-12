import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tabela de clientes (PJ/PF). Cadastro gerenciado pelo admin — base para a
 * futura relação cliente → chamado → técnico. CPF/CNPJ únicos quando presentes.
 */
export class CreateClientsTable1781900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "clients" (
        "id"           SERIAL PRIMARY KEY,
        "tipo"         VARCHAR NOT NULL DEFAULT 'pj',
        "nome"         VARCHAR NOT NULL,
        "nomeFantasia" VARCHAR,
        "cnpj"         VARCHAR,
        "cpf"          VARCHAR,
        "email"        VARCHAR,
        "telefone"     VARCHAR,
        "contatoNome"  VARCHAR,
        "cep"          VARCHAR,
        "logradouro"   VARCHAR,
        "numero"       VARCHAR,
        "complemento"  VARCHAR,
        "bairro"       VARCHAR,
        "cidade"       VARCHAR,
        "estado"       VARCHAR,
        "observacoes"  TEXT,
        "ativo"        BOOLEAN NOT NULL DEFAULT true,
        "createdAt"    TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt"    TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    // Unicidade parcial: só vale quando o documento está preenchido.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_clients_cnpj" ON "clients" ("cnpj") WHERE "cnpj" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_clients_cpf" ON "clients" ("cpf") WHERE "cpf" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "clients"`);
  }
}
