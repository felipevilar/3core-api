import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Estrutura de cliente do field service:
 *  - `clients.contratanteId`: cliente final pode pertencer a um contratante
 *    (quem fatura/abre a demanda — ex.: operadora → loja).
 *  - `client_locais`: locais/sites de atendimento do cliente (endereço,
 *    coordenadas, contato no local, códigos de check-in/out).
 *  - `chamados`: vínculo opcional ao local + coordenadas + contato no local.
 *    O endereço continua copiado para o chamado (snapshot da época).
 */
export class ClientLocaisContratante1783800000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "clients"
       ADD COLUMN IF NOT EXISTS "contratanteId" INT REFERENCES "clients"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_clients_contratanteId" ON "clients" ("contratanteId")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "client_locais" (
        "id"               SERIAL PRIMARY KEY,
        "clientId"         INT NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
        "nome"             VARCHAR NOT NULL,
        "cep"              VARCHAR,
        "logradouro"       VARCHAR,
        "numero"           VARCHAR,
        "complemento"      VARCHAR,
        "bairro"           VARCHAR,
        "pontoReferencia"  VARCHAR,
        "cityCode"         INT REFERENCES "cities"("code") ON DELETE SET NULL,
        "latitude"         DOUBLE PRECISION,
        "longitude"        DOUBLE PRECISION,
        "contatoNome"      VARCHAR,
        "contatoTelefone"  VARCHAR,
        "codigoCheckin"    VARCHAR,
        "codigoCheckout"   VARCHAR,
        "observacoes"      TEXT,
        "ativo"            BOOLEAN NOT NULL DEFAULT true,
        "createdAt"        TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt"        TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_client_locais_clientId" ON "client_locais" ("clientId")`,
    );

    await queryRunner.query(
      `ALTER TABLE "chamados"
       ADD COLUMN IF NOT EXISTS "localId" INT REFERENCES "client_locais"("id") ON DELETE SET NULL,
       ADD COLUMN IF NOT EXISTS "latitude" DOUBLE PRECISION,
       ADD COLUMN IF NOT EXISTS "longitude" DOUBLE PRECISION,
       ADD COLUMN IF NOT EXISTS "contatoLocalNome" VARCHAR,
       ADD COLUMN IF NOT EXISTS "contatoLocalTelefone" VARCHAR,
       ADD COLUMN IF NOT EXISTS "codigoCheckin" VARCHAR,
       ADD COLUMN IF NOT EXISTS "codigoCheckout" VARCHAR`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "chamados"
       DROP COLUMN IF EXISTS "codigoCheckout",
       DROP COLUMN IF EXISTS "codigoCheckin",
       DROP COLUMN IF EXISTS "contatoLocalTelefone",
       DROP COLUMN IF EXISTS "contatoLocalNome",
       DROP COLUMN IF EXISTS "longitude",
       DROP COLUMN IF EXISTS "latitude",
       DROP COLUMN IF EXISTS "localId"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "client_locais"`);
    await queryRunner.query(
      `ALTER TABLE "clients" DROP COLUMN IF EXISTS "contratanteId"`,
    );
  }
}
