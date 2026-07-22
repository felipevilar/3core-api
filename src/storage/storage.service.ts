import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageClient } from '@supabase/storage-js';

export const RATS_BUCKET = 'rats';
export const AVATARS_BUCKET = 'avatars';

/**
 * Acesso ao Supabase Storage usando a service_role key (só no servidor).
 * Usa o StorageClient diretamente (não o supabase-js completo) para não puxar
 * o cliente Realtime, que exige WebSocket nativo indisponível no Node 20 e
 * quebraria o boot. Gera signed URLs de upload/download com validade curta —
 * o frontend nunca toca na chave nem no bucket privado.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: StorageClient | null;

  constructor(config: ConfigService) {
    const url = config.get<string>('SUPABASE_URL');
    const key = config.get<string>('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) {
      this.logger.warn(
        'SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes — upload de RAT indisponível',
      );
      this.client = null;
    } else {
      // Endpoint REST do Storage; autentica com a service_role key.
      this.client = new StorageClient(`${url}/storage/v1`, {
        apikey: key,
        Authorization: `Bearer ${key}`,
      });
    }
  }

  private ensure(): StorageClient {
    if (!this.client) {
      throw new InternalServerErrorException(
        'Storage não configurado (SUPABASE_URL/SERVICE_ROLE_KEY)',
      );
    }
    return this.client;
  }

  /** URL assinada para o cliente subir o arquivo diretamente ao bucket. */
  async createSignedUploadUrl(path: string, bucket = RATS_BUCKET) {
    const { data, error } = await this.ensure()
      .from(bucket)
      .createSignedUploadUrl(path);
    if (error || !data) {
      throw new InternalServerErrorException(
        `Falha ao gerar URL de upload: ${error?.message ?? 'desconhecida'}`,
      );
    }
    return { path, token: data.token, signedUrl: data.signedUrl };
  }

  /** URL assinada de leitura (download), validade em segundos. */
  async createSignedDownloadUrl(
    path: string,
    expiresInSeconds = 300,
    bucket = RATS_BUCKET,
  ) {
    const { data, error } = await this.ensure()
      .from(bucket)
      .createSignedUrl(path, expiresInSeconds);
    if (error || !data) {
      throw new InternalServerErrorException(
        `Falha ao gerar URL de download: ${error?.message ?? 'desconhecida'}`,
      );
    }
    return { signedUrl: data.signedUrl };
  }

  /** Gera múltiplas URLs assinadas de leitura em uma única chamada ao Storage. */
  async createSignedDownloadUrls(
    paths: string[],
    expiresInSeconds = 300,
    bucket = RATS_BUCKET,
  ): Promise<Record<string, string>> {
    if (!paths.length) return {};
    const { data, error } = await this.ensure()
      .from(bucket)
      .createSignedUrls(paths, expiresInSeconds);
    if (error || !data) {
      throw new InternalServerErrorException(
        `Falha ao gerar URLs de download: ${error?.message ?? 'desconhecida'}`,
      );
    }
    return Object.fromEntries(
      data
        .filter((item) => item.signedUrl)
        .map((item) => [item.path, item.signedUrl]),
    );
  }

  /** Remove um objeto (usado se um upload for cancelado/substituído). */
  async remove(path: string, bucket = RATS_BUCKET) {
    await this.ensure().from(bucket).remove([path]);
  }
}
