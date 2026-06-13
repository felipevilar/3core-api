/**
 * Catálogo de permissões — FONTE ÚNICA DE VERDADE.
 *
 * Consumido pela migration de seed (cria as linhas em `permissions`) e pelo
 * endpoint `GET /permissions` (lista agrupada por feature para a UI de papéis).
 *
 * Cada permissão é uma chave estável no formato `feature.acao`. Granularidade
 * híbrida: chaves de visibilidade de menu (`*.ver` / `*.gerenciar`) + ações
 * finas (criar/editar/excluir) só onde há fronteira real de autorização.
 */

export interface PermissionDef {
  key: string;
  label: string;
  feature: string;
}

/** Rótulo amigável de cada feature (usado para agrupar na UI). */
export const FEATURE_LABELS: Record<string, string> = {
  dashboard: 'Painel',
  atendimentos: 'Atendimentos',
  clientes: 'Clientes',
  inbox: 'Caixa de Entrada',
  landing: 'Landing Page',
  tecnicos: 'Técnicos',
  usuarios: 'Usuários',
  roles: 'Papéis',
  perfil: 'Perfil',
  configuracoes: 'Configurações',
};

export const PERMISSIONS: PermissionDef[] = [
  // Painel inicial
  { key: 'dashboard.ver', label: 'Ver painel inicial', feature: 'dashboard' },

  // Atendimentos (híbrido)
  {
    key: 'atendimentos.ver',
    label: 'Ver atendimentos',
    feature: 'atendimentos',
  },
  {
    key: 'atendimentos.criar',
    label: 'Criar atendimento',
    feature: 'atendimentos',
  },
  {
    key: 'atendimentos.editar',
    label: 'Editar atendimento',
    feature: 'atendimentos',
  },
  {
    key: 'atendimentos.excluir',
    label: 'Excluir atendimento',
    feature: 'atendimentos',
  },

  // Clientes (híbrido)
  { key: 'clientes.ver', label: 'Ver clientes', feature: 'clientes' },
  { key: 'clientes.criar', label: 'Criar cliente', feature: 'clientes' },
  { key: 'clientes.editar', label: 'Editar cliente', feature: 'clientes' },
  { key: 'clientes.excluir', label: 'Excluir cliente', feature: 'clientes' },

  // Caixa de entrada
  { key: 'inbox.ver', label: 'Ver caixa de entrada', feature: 'inbox' },

  // Landing page (configuração)
  {
    key: 'landing.ver',
    label: 'Ver configuração da landing',
    feature: 'landing',
  },
  {
    key: 'landing.gerenciar',
    label: 'Gerenciar áreas/ferramental da landing',
    feature: 'landing',
  },

  // Técnicos (administração)
  {
    key: 'tecnicos.ver',
    label: 'Ver técnicos (lista e ficha)',
    feature: 'tecnicos',
  },

  // Usuários (administração)
  { key: 'usuarios.ver', label: 'Ver usuários', feature: 'usuarios' },
  {
    key: 'usuarios.gerenciar',
    label: 'Gerenciar usuários (papel, ativar/desativar)',
    feature: 'usuarios',
  },

  // Papéis (administração)
  { key: 'roles.ver', label: 'Ver papéis', feature: 'roles' },
  {
    key: 'roles.gerenciar',
    label: 'Criar/editar/excluir papéis e permissões',
    feature: 'roles',
  },

  // Perfil e configurações
  {
    key: 'perfil.ver',
    label: 'Ver e editar o próprio perfil',
    feature: 'perfil',
  },
  {
    key: 'configuracoes.ver',
    label: 'Ver configurações gerais',
    feature: 'configuracoes',
  },
];

/** Todas as chaves de permissão (usado para o papel super_admin). */
export const ALL_PERMISSION_KEYS: string[] = PERMISSIONS.map((p) => p.key);

/** Permissões padrão do papel `tecnico`. */
export const TECNICO_PERMISSION_KEYS: string[] = [
  'dashboard.ver',
  'perfil.ver',
  'atendimentos.ver',
  'atendimentos.editar',
];

/** Nomes dos papéis de sistema (não podem ser renomeados/excluídos pela UI). */
export const ROLE_SUPER_ADMIN = 'super_admin';
export const ROLE_TECNICO = 'tecnico';
