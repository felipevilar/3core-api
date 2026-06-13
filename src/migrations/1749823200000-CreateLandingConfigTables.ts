import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLandingConfigTables1749823200000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "option_groups" (
        "id"         SERIAL PRIMARY KEY,
        "type"       VARCHAR NOT NULL,
        "name"       VARCHAR NOT NULL,
        "order"      INT NOT NULL DEFAULT 0,
        "active"     BOOLEAN NOT NULL DEFAULT true,
        "createdAt"  TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt"  TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "option_items" (
        "id"        SERIAL PRIMARY KEY,
        "label"     VARCHAR NOT NULL,
        "order"     INT NOT NULL DEFAULT 0,
        "active"    BOOLEAN NOT NULL DEFAULT true,
        "groupId"   INT REFERENCES "option_groups"("id") ON DELETE CASCADE,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    // ------------------------------------------------------------------ seed
    type Row = { type: string; name: string; order: number; items: string[] };
    const groups: Row[] = [
      // áreas de atuação
      {
        type: 'area',
        name: 'Suporte e Atendimento',
        order: 1,
        items: [
          'Suporte Técnico (Help Desk)',
          'Triagem / Mesa de Atendimento',
          'Atendimento N1, N2 e N3',
          'Suporte remoto e presencial',
          'Troubleshooting de hardware e software',
          'Atendimento a usuários finais',
        ],
      },
      {
        type: 'area',
        name: 'Infraestrutura e Redes',
        order: 2,
        items: [
          'Infraestrutura de Rede',
          'Cabeamento estruturado',
          'Conexão de cabo / cabeamento',
          'Configuração de redes LAN/WAN',
          'Configuração de roteadores e switches',
          'Instalação e configuração de Wi-Fi',
          'Monitoramento de links e dispositivos',
          'VPN e firewall',
        ],
      },
      {
        type: 'area',
        name: 'Instalação e Campo',
        order: 3,
        items: [
          'Field Service',
          'Instalação de equipamentos',
          'Implantação de estações de trabalho',
          'Instalação de monitores e players',
          'Instalação de racks e organização',
          'Passagem de cabos',
          'Instalação de monitor profissional',
          'Instalação de telas acima de 50"',
          'Instalação de videowall',
          'Instalação de painel de LED',
          'Estruturação e fixação de telas',
          'Configuração de players Android/Windows',
          'Instalação de Digital Signage / DOOH',
        ],
      },
      {
        type: 'area',
        name: 'Hardware e Manutenção',
        order: 4,
        items: [
          'Manutenção de hardware',
          'Upgrade de equipamentos',
          'Troca de peças',
          'Limpeza técnica',
          'Montagem e desmontagem de equipamentos',
          'Diagnóstico técnico',
        ],
      },
      {
        type: 'area',
        name: 'Sistemas e Software',
        order: 5,
        items: [
          'Configuração de software',
          'Instalação de sistemas operacionais',
          'Configuração de aplicativos corporativos',
          'Backup e restauração',
          'Formatação e imagem de sistemas',
        ],
      },
      {
        type: 'area',
        name: 'Servidores e Datacenter',
        order: 6,
        items: [
          'Administração de servidores Windows/Linux',
          'Virtualização',
          'Active Directory',
          'Gerenciamento de storage',
          'Monitoramento de servidores',
          'Administração de serviços de rede',
        ],
      },
      {
        type: 'area',
        name: 'Segurança e Monitoramento',
        order: 7,
        items: [
          'CFTV / Câmeras de Segurança',
          'Controle de acesso',
          'Segurança da informação',
          'Auditoria e compliance',
          'Gestão de políticas de segurança',
        ],
      },
      {
        type: 'area',
        name: 'Telecom e Periféricos',
        order: 8,
        items: [
          'Telefonia / VOIP',
          'Impressoras e periféricos',
          'Configuração de scanners',
          'Configuração de coletores',
          'Dispositivos USB e serial',
        ],
      },
      {
        type: 'area',
        name: 'Especialidades',
        order: 9,
        items: [
          'Digital Signage / DOOH',
          'ATM / Totens de autoatendimento',
          'POS / PDV',
          'Equipamentos industriais',
          'Smart TVs e players Android',
          'Automação comercial',
          'Painel de LED indoor/outdoor',
          'Monitores corporativos Samsung/LG/Philips',
          'Sincronização de videowall',
          'Instalação com suporte articulado/teto/parede',
        ],
      },
      // ferramental técnico
      {
        type: 'tool',
        name: 'Equipamentos Básicos',
        order: 1,
        items: [
          'Notebook (TeamViewer / PuTTY / AnyDesk)',
          'Smartphone com acesso 4G/pacote de dados',
          'Pendrive bootável',
          'HD externo',
          'Imagem de Sistema Operacional',
          "Software Hiren's Boot",
          'Pasta térmica',
          'Celular Android com disponibilidade de dados',
        ],
      },
      {
        type: 'tool',
        name: 'Ferramentas de Rede (Networking)',
        order: 2,
        items: [
          'Alicate de corte',
          'Alicate de crimpar',
          'Pushdown',
          'Chaves de fenda',
          'Chave Phillips',
          'Kit chave Allen',
          'Kit chave Torx',
          'Conectores RJ45',
          'Conectores Keystone',
          'Cabo de rede para testes',
          'Jumpers UTP CAT6 (direto e cross)',
          'Cabos console',
          'Cabo USB serial',
          'Testador de cabo',
          'Etiquetas adesivas / fita crepe',
          'Pulseira antiestática',
          'Multímetro',
          'Etiquetadora',
          'Localizador de Cabo (Zumbidor)',
          'Furadeira',
          'Parafusadeira',
        ],
      },
      {
        type: 'tool',
        name: 'Itens para Players / Monitores / DOOH',
        order: 3,
        items: [
          'Tela/monitor de apoio (HDMI)',
          'Fone P2',
          'Controle remoto universal',
          'Teclado',
          'Mouse',
          'Cabo USB',
          'Cabo HDMI',
          'Cabo DisplayPort',
          'Adaptador HDMI/VGA',
        ],
      },
    ];

    for (const g of groups) {
      const escaped = g.name.replace(/'/g, "''");
      const result = await queryRunner.query(`
        INSERT INTO "option_groups" ("type", "name", "order")
        VALUES ('${g.type}', '${escaped}', ${g.order})
        RETURNING "id"
      `);
      const groupId: number = result[0].id;
      for (let i = 0; i < g.items.length; i++) {
        const label = g.items[i].replace(/'/g, "''");
        await queryRunner.query(`
          INSERT INTO "option_items" ("label", "order", "groupId")
          VALUES ('${label}', ${i + 1}, ${groupId})
        `);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "option_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "option_groups"`);
  }
}
