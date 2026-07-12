import { MigrationInterface, QueryRunner } from 'typeorm';

// Normalização de acentos em SQL sem depender da extensão `unaccent`.
// Mapa estático (não é entrada de usuário) — interpolação segura.
const ACC = 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ';
const PLAIN = 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC';
const norm = (col: string) => `lower(translate(${col}, '${ACC}', '${PLAIN}'))`;

/**
 * Passa cidade de residência (clients + tech_profiles) para FK por código IBGE
 * e normaliza tech_profiles.cidadesAtendidas (JSONB) em tech_service_areas.
 *
 * Backfill casa os nomes atuais contra `cities` por (searchName, uf) quando há
 * UF; senão só por searchName. Depois remove os campos textuais antigos.
 */
export class CityRefsAndServiceAreas1782100000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ----------------------------------------- clients: cityCode + backfill
    await queryRunner.query(`ALTER TABLE "clients" ADD COLUMN "cityCode" INT`);
    await queryRunner.query(`
      UPDATE "clients" cl SET "cityCode" = c."code"
      FROM "cities" c
      WHERE c."searchName" = ${norm('cl."cidade"')}
        AND (cl."estado" IS NULL OR c."uf" = upper(cl."estado"))
        AND cl."cidade" IS NOT NULL
    `);
    await queryRunner.query(
      `ALTER TABLE "clients" ADD CONSTRAINT "FK_clients_city"
       FOREIGN KEY ("cityCode") REFERENCES "cities"("code") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_clients_cityCode" ON "clients" ("cityCode")`,
    );
    await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN "cidade"`);
    await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN "estado"`);

    // ------------------------------------ tech_profiles: cityCode + backfill
    await queryRunner.query(
      `ALTER TABLE "tech_profiles" ADD COLUMN "cityCode" INT`,
    );
    await queryRunner.query(`
      UPDATE "tech_profiles" tp SET "cityCode" = c."code"
      FROM "cities" c
      WHERE c."searchName" = ${norm('tp."cidade"')}
        AND (tp."estado" IS NULL OR c."uf" = upper(tp."estado"))
        AND tp."cidade" IS NOT NULL
    `);
    await queryRunner.query(
      `ALTER TABLE "tech_profiles" ADD CONSTRAINT "FK_tech_profiles_city"
       FOREIGN KEY ("cityCode") REFERENCES "cities"("code") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_tech_profiles_cityCode" ON "tech_profiles" ("cityCode")`,
    );

    // --------------------------------------------- tech_service_areas (nova)
    await queryRunner.query(`
      CREATE TABLE "tech_service_areas" (
        "id"            SERIAL PRIMARY KEY,
        "techProfileId" INT NOT NULL REFERENCES "tech_profiles"("id") ON DELETE CASCADE,
        "cityCode"      INT NOT NULL REFERENCES "cities"("code") ON DELETE RESTRICT,
        "custoKm"       NUMERIC(12,2)
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_tech_service_areas" ON "tech_service_areas" ("techProfileId", "cityCode")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_tech_service_areas_cityCode" ON "tech_service_areas" ("cityCode")`,
    );

    // Backfill a partir do JSONB. custoKm no formato BR ("130,00") → numeric.
    // Casa a cidade por nome (sem acento). DISTINCT evita violar a unicidade.
    await queryRunner.query(`
      INSERT INTO "tech_service_areas" ("techProfileId", "cityCode", "custoKm")
      SELECT DISTINCT ON (tp."id", c."code")
             tp."id",
             c."code",
             NULLIF(replace(replace(elem->>'custoKm', '.', ''), ',', '.'), '')::numeric
      FROM "tech_profiles" tp,
           jsonb_array_elements(tp."cidadesAtendidas") elem
      JOIN "cities" c
        ON c."searchName" = ${norm(`elem->>'cidade'`)}
      WHERE tp."cidadesAtendidas" IS NOT NULL
    `);

    // --------------------------------------------- remove campos antigos
    await queryRunner.query(`ALTER TABLE "tech_profiles" DROP COLUMN "cidade"`);
    await queryRunner.query(`ALTER TABLE "tech_profiles" DROP COLUMN "estado"`);
    await queryRunner.query(
      `ALTER TABLE "tech_profiles" DROP COLUMN "cidadesAtendidas"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restaura colunas textuais (dados não são reconstituídos em detalhe).
    await queryRunner.query(
      `ALTER TABLE "tech_profiles" ADD COLUMN "cidadesAtendidas" JSONB`,
    );
    await queryRunner.query(
      `ALTER TABLE "tech_profiles" ADD COLUMN "estado" VARCHAR`,
    );
    await queryRunner.query(
      `ALTER TABLE "tech_profiles" ADD COLUMN "cidade" VARCHAR`,
    );
    await queryRunner.query(`
      UPDATE "tech_profiles" tp SET "cidade" = c."nome", "estado" = c."uf"
      FROM "cities" c WHERE c."code" = tp."cityCode"
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "tech_service_areas"`);
    await queryRunner.query(
      `ALTER TABLE "tech_profiles" DROP CONSTRAINT IF EXISTS "FK_tech_profiles_city"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_tech_profiles_cityCode"`);
    await queryRunner.query(
      `ALTER TABLE "tech_profiles" DROP COLUMN "cityCode"`,
    );

    await queryRunner.query(`ALTER TABLE "clients" ADD COLUMN "estado" VARCHAR`);
    await queryRunner.query(`ALTER TABLE "clients" ADD COLUMN "cidade" VARCHAR`);
    await queryRunner.query(`
      UPDATE "clients" cl SET "cidade" = c."nome", "estado" = c."uf"
      FROM "cities" c WHERE c."code" = cl."cityCode"
    `);
    await queryRunner.query(
      `ALTER TABLE "clients" DROP CONSTRAINT IF EXISTS "FK_clients_city"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_clients_cityCode"`);
    await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN "cityCode"`);
  }
}
