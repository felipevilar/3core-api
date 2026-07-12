import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const RATS_BUCKET = 'rats';

/**
 * Acesso ao Supabase Storage usando a service_role key (só no servidor).
 * Gera signed URLs de upload e download com validade curta — o frontend nunca
 * toca na chave nem no bucket privado diretamente.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: SupabaseClient | null;

  constructor(config: ConfigService) {
    const url = config.get<string>('SUPABASE_URL');
    const key = config.get<string>('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) {
      this.logger.warn(
        'SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes — upload de RAT indisponível',
      );
      this.client = null;
    } else {
      this.client = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    }
  }

  private ensure(): SupabaseClient {
    if (!this.client) {
      throw new InternalServerErrorException(
        'Storage não configurado (SUPABASE_URL/SERVICE_ROLE_KEY)',
      );
    }
    return this.client;
  }

  /** URL assinada para o cliente subir o arquivo diretamente ao bucket. */
  async createSignedUploadUrl(path: string) {
    const { data, error } = await this.ensure()
      .storage.from(RATS_BUCKET)
      .createSignedUploadUrl(path);
    if (error || !data) {
      throw new InternalServerErrorException(
        `Falha ao gerar URL de upload: ${error?.message ?? 'desconhecida'}`,
      );
    }
    return { path, token: data.token, signedUrl: data.signedUrl };
  }

  /** URL assinada de leitura (download), validade em segundos. */
  async createSignedDownloadUrl(path: string, expiresInSeconds = 300) {
    const { data, error } = await this.ensure()
      .storage.from(RATS_BUCKET)
      .createSignedUrl(path, expiresInSeconds);
    if (error || !data) {
      throw new InternalServerErrorException(
        `Falha ao gerar URL de download: ${error?.message ?? 'desconhecida'}`,
      );
    }
    return { signedUrl: data.signedUrl };
  }

  /** Remove um objeto (usado se um upload for cancelado/substituído). */
  async remove(path: string) {
    await this.ensure().storage.from(RATS_BUCKET).remove([path]);
  }
}
