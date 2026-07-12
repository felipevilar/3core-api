import { MigrationInterface, QueryRunner } from 'typeorm';
import { readFileSync } from 'fs';
import { join } from 'path';

interface CitySeed {
  code: number;
  nome: string;
  searchName: string;
  uf: string;
  ufNome: string;
  regiao: string;
  lat: number | null;
  lng: number | null;
  capital: boolean;
}

/**
 * Tabela de referência de municípios (fonte IBGE), com código IBGE como PK.
 * Seed dos 5.570+ municípios embutido em src/migrations/data/cities.json.
 */
export class CreateCitiesTable1782000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "cities" (
        "code"       INT PRIMARY KEY,
        "nome"       VARCHAR NOT NULL,
        "searchName" VARCHAR NOT NULL,
        "uf"         CHAR(2) NOT NULL,
        "ufNome"     VARCHAR NOT NULL,
        "regiao"     VARCHAR(2) NOT NULL,
        "lat"        DOUBLE PRECISION,
        "lng"        DOUBLE PRECISION,
        "capital"    BOOLEAN NOT NULL DEFAULT false
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_cities_searchName" ON "cities" ("searchName")`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_cities_uf" ON "cities" ("uf")`);
    await queryRunner.query(
      `CREATE INDEX "IDX_cities_regiao" ON "cities" ("regiao")`,
    );

    // Lê o seed do disco (funciona sob ts-node em migration:run).
    const seedPath = join(__dirname, 'data', 'cities.json');
    const cities = JSON.parse(readFileSync(seedPath, 'utf-8')) as CitySeed[];

    // Insere em lotes com placeholders parametrizados (sem interpolação).
    const COLS = 9;
    const BATCH = 500;
    for (let i = 0; i < cities.length; i += BATCH) {
      const slice = cities.slice(i, i + BATCH);
      const values: unknown[] = [];
      const rows = slice.map((c, idx) => {
        const base = idx * COLS;
        values.push(
          c.code,
          c.nome,
          c.searchName,
          c.uf,
          c.ufNome,
          c.regiao,
          c.lat,
          c.lng,
          c.capital,
        );
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9})`;
      });
      await queryRunner.query(
        `INSERT INTO "cities" ("code", "nome", "searchName", "uf", "ufNome", "regiao", "lat", "lng", "capital")
         VALUES ${rows.join(', ')}`,
        values,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "cities"`);
  }
}
