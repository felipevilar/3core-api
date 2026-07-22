import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserBioAndAvatar1783300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users"
       ADD COLUMN IF NOT EXISTS "bio" TEXT,
       ADD COLUMN IF NOT EXISTS "avatar_path" VARCHAR`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users"
       DROP COLUMN IF EXISTS "avatar_path",
       DROP COLUMN IF EXISTS "bio"`,
    );
  }
}
