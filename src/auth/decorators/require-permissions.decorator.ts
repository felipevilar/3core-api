import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';
export const ANY_PERMISSIONS_KEY = 'any_permissions';

/** Exige que o usuário tenha TODAS as permissões informadas. */
export const RequirePermissions = (...keys: string[]) =>
  SetMetadata(PERMISSIONS_KEY, keys);

/** Exige que o usuário tenha PELO MENOS UMA das permissões informadas. */
export const RequireAnyPermission = (...keys: string[]) =>
  SetMetadata(ANY_PERMISSIONS_KEY, keys);
