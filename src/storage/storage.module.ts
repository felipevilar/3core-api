import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service';

/** Fornece o StorageService (Supabase) globalmente. */
@Global()
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
