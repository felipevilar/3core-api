import { MigrationInterface, QueryRunner } from 'typeorm';
import * as bcrypt from 'bcrypt';
import {
  ALL_PERMISSION_KEYS,
  PERMISSIONS,
  ROLE_SUPER_ADMIN,
  ROLE_TECNICO,
  TECNICO_PERMISSION_KEYS,
} from '../auth/permissions.catalog';

export class CreateAuthTables1781700000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ----------------------------------------------------------- tabelas
    await queryRunner.query(`
      CREATE TABLE "permissions" (
        "id"         SERIAL PRIMARY KEY,
        "key"        VARCHAR NOT NULL UNIQUE,
        "label"      VARCHAR NOT NULL,
        "feature"    VARCHAR NOT NULL,
        "createdAt"  TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt"  TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "roles" (
        "id"          SERIAL PRIMARY KEY,
        "name"        VARCHAR NOT NULL UNIQUE,
        "description" VARCHAR,
        "isSystem"    BOOLEAN NOT NULL DEFAULT false,
        "createdAt"   TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt"   TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "role_permissions" (
        "roleId"       INT NOT NULL REFERENCES "roles"("id") ON DELETE CASCADE,
        "permissionId" INT NOT NULL REFERENCES "permissions"("id") ON DELETE CASCADE,
        PRIMARY KEY ("roleId", "permissionId")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "users" (
        "id"           SERIAL PRIMARY KEY,
        "email"        VARCHAR NOT NULL UNIQUE,
        "passwordHash" VARCHAR NOT NULL,
        "name"         VARCHAR NOT NULL,
        "isActive"     BOOLEAN NOT NULL DEFAULT true,
        "roleId"       INT NOT NULL REFERENCES "roles"("id"),
        "createdAt"    TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt"    TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "tech_profiles" (
        "id"                 SERIAL PRIMARY KEY,
        "userId"             INT NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
        "cpf"                VARCHAR NOT NULL UNIQUE,
        "rg"                 VARCHAR,
        "celular"            VARCHAR NOT NULL,
        "cep"                VARCHAR,
        "logradouro"         VARCHAR,
        "numero"             VARCHAR,
        "complemento"        VARCHAR,
        "bairro"             VARCHAR,
        "cidade"             VARCHAR,
        "estado"             VARCHAR,
        "enderecoEncomendas" VARCHAR,
        "pretensaoValorHora" VARCHAR,
        "custoPorKm"         VARCHAR,
        "pagamento"          JSONB,
        "empresa"            JSONB,
        "areasAtuacao"       JSONB,
        "ferramental"        JSONB,
        "cidadesAtendidas"   JSONB,
        "createdAt"          TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt"          TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    // -------------------------------------------------- seed: permissões
    // Queries PARAMETRIZADAS ($1,$2,...) — sem interpolação de string.
    for (const p of PERMISSIONS) {
      await queryRunner.query(
        `INSERT INTO "permissions" ("key", "label", "feature") VALUES ($1, $2, $3)`,
        [p.key, p.label, p.feature],
      );
    }

    // ------------------------------------------------------- seed: papéis
    const superAdminRows = (await queryRunner.query(
      `INSERT INTO "roles" ("name", "description", "isSystem") VALUES ($1, $2, true) RETURNING "id"`,
      [ROLE_SUPER_ADMIN, 'Acesso total ao sistema'],
    )) as { id: number }[];
    const superAdminRoleId = superAdminRows[0].id;

    const tecnicoRows = (await queryRunner.query(
      `INSERT INTO "roles" ("name", "description", "isSystem") VALUES ($1, $2, true) RETURNING "id"`,
      [
        ROLE_TECNICO,
        'Técnico parceiro — acesso ao próprio perfil e atendimentos',
      ],
    )) as { id: number }[];
    const tecnicoRoleId = tecnicoRows[0].id;

    // ----------------------------------------- vínculo papéis ↔ permissões
    // super_admin: todas as permissões.
    await queryRunner.query(
      `INSERT INTO "role_permissions" ("roleId", "permissionId")
       SELECT $1, "id" FROM "permissions" WHERE "key" = ANY($2)`,
      [superAdminRoleId, ALL_PERMISSION_KEYS],
    );

    // tecnico: subconjunto limitado.
    await queryRunner.query(
      `INSERT INTO "role_permissions" ("roleId", "permissionId")
       SELECT $1, "id" FROM "permissions" WHERE "key" = ANY($2)`,
      [tecnicoRoleId, TECNICO_PERMISSION_KEYS],
    );

    // --------------------------------------- usuário super_admin de bootstrap
    const email = process.env.SUPERADMIN_EMAIL ?? 'admin@3core.com.br';
    const password = process.env.SUPERADMIN_PASSWORD ?? 'Troque@Esta123';
    const passwordHash = await bcrypt.hash(password, 12);
    await queryRunner.query(
      `INSERT INTO "users" ("email", "passwordHash", "name", "isActive", "roleId")
       VALUES ($1, $2, $3, true, $4)`,
      [email, passwordHash, 'Super Admin', superAdminRoleId],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "tech_profiles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "role_permissions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "roles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "permissions"`);
  }
}
