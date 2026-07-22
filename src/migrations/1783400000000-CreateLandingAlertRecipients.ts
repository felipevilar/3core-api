import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLandingAlertRecipients1783400000000
  implements MigrationInterface
{
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "landing_alert_recipients" (
        "id"        SERIAL PRIMARY KEY,
        "userId"    INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "uq_landing_alert_recipients_user" UNIQUE ("userId")
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "landing_alert_recipients"`);
  }
}
