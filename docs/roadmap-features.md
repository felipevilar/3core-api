# Roadmap de Features — 3core API

> **Atualização 2026-10-21:** os recursos derivados do Field Control (visitas,
> locais/contratante, geolocalização, assinatura, avaliação, pausa, SLA, catálogo,
> motivos, comentários, notificações in-app, arquivamento) foram implementados —
> ver `gap-fieldcontrol-vs-3core.md`. Os itens abaixo que NÃO vêm do FC (ativos,
> formulários, orçamentos, portal do cliente, webhooks) seguem válidos.

Mapa das features candidatas a implementação, inspiradas em plataformas de field
service (referência: Field Control) e adaptadas ao nosso domínio de **suporte e
atendimento técnico em TI**.

Cada item traz a lacuna atual, onde encaixa no código e um esforço estimado,
para priorizar sem reabrir a análise toda a cada rodada.

## Base e método

- **Lado 3core (o que já existe e onde cada feature encaixa):** levantado lendo
  as entidades e controllers reais em `src/`. É fiel ao código na data abaixo.
- **Lado benchmark (Field Control):** baseado em conhecimento geral do produto e
  da categoria de field service, **não** em inspeção ao vivo da ferramenta.
  Antes de especificar cada item, vale validar o comportamento exato no produto.
- **Convenções do projeto:** NestJS 11 + TypeORM + PostgreSQL. Schema só muda via
  migration em `src/migrations/` (nunca autosync). Permissões vêm do catálogo
  único `src/auth/permissions.catalog.ts`. Dinheiro é string com utilitários de
  `src/common/br-money.ts`. Próximo timestamp de migration: `1783600000000+`.

Legenda de esforço: **Baixo** (dias), **Médio** (1–2 semanas), **Alto** (semanas).

---

## Resumo

| # | Feature | Prioridade | Esforço | Depende de |
|---|---------|-----------|---------|-----------|
| 1 | Registro de equipamentos / ativos | Alta | Médio | — |
| 2 | Checklists / formulários por tipo de atendimento | Alta | Alto | — |
| 3 | Notificações ao cliente | Alta | Baixo (e-mail) | — |
| 4 | Manutenção preventiva recorrente + SLA | Alta | Alto | 1 (ideal) |
| 5 | Assinatura digital do cliente | Média | Baixo/Médio | — |
| 6 | Pesquisa de satisfação / NPS | Média | Médio | 3 |
| 7 | Catálogo de serviços/produtos + estoque | Média | Médio/Alto | — |
| 8 | Geolocalização do técnico | Média | Baixo (captura) | — |
| 9 | Orçamentos / propostas | Baixa | Alto | 7 (ideal) |
| 10 | Portal do cliente | Baixa | Alto | — |
| 11 | Dashboards operacionais (SLA, produtividade) | Baixa | Médio | 4 (ideal) |
| 12 | Webhooks / API pública | Baixa | Médio/Alto | — |

---

## Estado atual (o que já temos)

Resumo do que o backend já cobre, para não reimplementar:

- **Chamados** com ciclo de vida completo (`aberto → solicitado → atribuido →
  a_caminho → em_atendimento → finalizado → fechado`, mais `cancelado` e
  `reaberto`), prioridade, endereço, timestamps por transição e lock otimista.
  `src/chamados/entities/chamado.entity.ts`
- **Agenda:** coluna `agendadoPara` indexada, endpoint de calendário e reagendar.
- **Financeiro maduro:** snapshots de tarifa congelados, line items auto/manual,
  dois ciclos de pagamento (técnico e cliente), competência YYYY-MM e imposto de
  nota. `src/chamados/entities/chamado-line-item.entity.ts`
- **RAT:** upload de arquivo para o Supabase Storage, 1:N para revisões.
  `src/chamados/entities/chamado-rat.entity.ts`
- **Auditoria:** log append-only de eventos com metadata redigida por permissão.
  `src/chamados/entities/chamado-event.entity.ts`
- **Técnicos:** tarifas (valor/hora, custo/km), áreas de atuação, cidades
  atendidas com custo por km, dados de pagamento. `src/technicians/`
- **Clientes** PF/PJ, **cidades** por IBGE, **RBAC** granular e **e-mail** via
  Resend. `src/notifications/resend-notifier.ts`

---

## Tier 1 — maior alavancagem

### 1. Registro de equipamentos / ativos

**O que é.** Cadastro dos equipamentos instalados no cliente (servidor, desktop,
impressora, nobreak, switch), com nº de série, patrimônio, garantia, localização
e **histórico de atendimentos por equipamento**.

**Lacuna.** O chamado liga a `client`, não a um ativo. Não há histórico por
equipamento, que é justamente o diferencial de suporte em TI.

**Implementação.**
- Novo módulo `AssetsModule` (`src/assets/`) no padrão module/service/controller/dto.
- Entidade `Asset`: `clientId` (FK → `clients`), `tipo`, `fabricante`, `modelo`,
  `numeroSerie`, `patrimonio`, `dataCompra`, `fimGarantia`, `localizacao`,
  `observacoes`, `ativo`.
- Coluna opcional `assetId` em `chamados` (FK → `assets`, `ON DELETE SET NULL`) e
  no metadata do evento de auditoria.
- Permissões novas no catálogo: `ativos.ver`, `ativos.criar`, `ativos.editar`,
  `ativos.excluir`, mais `FEATURE_LABELS['ativos'] = 'Equipamentos'`.
- Endpoint de histórico: `GET /assets/:id/chamados`.
- Migration: cria `assets`, adiciona `assetId` em `chamados`, semeia permissões e
  concede ao `super_admin`.

**Esforço:** Médio.

### 2. Checklists / formulários customizáveis por tipo de atendimento

**O que é.** Templates de formulário por tipo de serviço (campos texto, número,
sim/não, seleção, foto) que o técnico preenche na finalização. As respostas viram
dado estruturado e reportável.

**Lacuna.** Hoje só existe RAT (arquivo) e `descricao` livre. Nada estruturado.

**Implementação.**
- Começar simples: entidade `FormTemplate` (`nome`, `tipoAtendimento`, `ativo`) e
  `FormField` (`templateId`, `label`, `tipo`, `obrigatorio`, `opcoes` jsonb,
  `ordem`). Respostas em `ChamadoFormResponse` (`chamadoId`, `templateId`,
  `respostas` jsonb).
- Opcional: coluna `tipoAtendimento` em `chamados` para casar o template certo.
- Permissões: `formularios.ver`, `formularios.gerenciar`.
- Integrar no passo de finalização do chamado (validar campos obrigatórios).

**Esforço:** Alto.

### 3. Notificações ao cliente

**O que é.** Avisar o **cliente** (não só técnico/admin) por e-mail, e depois
WhatsApp/SMS: chamado confirmado/agendado, técnico a caminho e atendimento
concluído.

**Lacuna.** O `Notifier` só fala com técnico e admin. O cliente tem e-mail e
telefone cadastrados, mas nunca é avisado. `src/notifications/notifier.ts`

**Implementação.**
- Estender a interface `Notifier` com `notifyClienteAgendado`,
  `notifyClienteACaminho`, `notifyClienteConcluido`.
- Implementar em `ResendNotifier` e `LogNotifier`, reaproveitando o `send()`.
- Chamar via `notifyAfter()` (fire-and-forget, pós-commit) nos pontos: reagendar,
  a-caminho, finalizar/fechar.
- WhatsApp depois é um novo provider implementando `Notifier`; troca-se o binding
  em `notifications.module.ts` sem tocar nos chamadores.

**Esforço:** Baixo (e-mail) / Médio (WhatsApp).

### 4. Manutenção preventiva recorrente + SLA

**O que é.** Planos/contratos que geram chamados recorrentes (ex. visita mensal) e
prazo de SLA por prioridade, com alerta de estouro.

**Lacuna.** `agendadoPara` é pontual. Não há recorrência, prazo nem alerta.

**Implementação.**
- **SLA primeiro (mais barato):** colunas `prazoLimite` (timestamptz) e
  `slaEstourado` (bool) em `chamados`, regra de prazo por prioridade, consulta/job
  que marca o estouro e emite evento `sla_estourado`.
- **Recorrência:** entidade `MaintenancePlan` (`clientId`, `assetId?`,
  `frequencia`, `proximaExecucao`, template do chamado) e um cron com
  `@nestjs/schedule` que cria o chamado na data.
- Permissões: `contratos.ver`, `contratos.gerenciar`.
- Preventiva por equipamento depende da feature 1 (ativos).

**Esforço:** Alto.

---

## Tier 2 — experiência e eficiência

### 5. Assinatura digital do cliente

Capturar a assinatura no dispositivo na finalização e anexar ao RAT. Recebe a
imagem, salva no bucket `RATS` via `StorageService`, cria um `ChamadoRat` marcado
como assinatura (ou coluna `clienteAssinaturaPath` no chamado) e guarda nome/doc
de quem assinou. **Esforço:** Baixo/Médio.

### 6. Pesquisa de satisfação / NPS

Após `fechado`, dispara survey ao cliente. Entidade `ChamadoSurvey` (`chamadoId`,
`nota`, `comentario`, `respondidoEm`) e endpoint público com token para resposta.
O disparo reusa o `Notifier` (feature 3). **Esforço:** Médio.

### 7. Catálogo de serviços/produtos + estoque

Entidade `CatalogItem` (`tipo` servico/material, `descricao`, `precoVenda`,
`custo`, `unidade`, `controlaEstoque`, `saldoEstoque`). Os line items passam a
referenciar `catalogItemId` opcional, mantendo o texto livre. Baixa de estoque ao
consumir material. Padroniza preço e acelera orçamento. **Esforço:** Médio/Alto.

### 8. Geolocalização do técnico

Capturar lat/long nos passos `a-caminho` e `chegada`, que já existem no fluxo.
Adicionar `aCaminhoLat/Lng` e `chegadaLat/Lng` em `chamados` (ou tabela de pings).
Mapa do dia e rastreio em tempo real consomem isso. **Esforço:** Baixo (captura) /
Médio (mapa e tempo real).

---

## Tier 3 — escala e acabamento

### 9. Orçamentos / propostas

Entidade `Orcamento` com itens e status (rascunho/enviado/aprovado/recusado). Ao
aprovar, converte em chamado. Ideal após o catálogo (feature 7). **Esforço:** Alto.

### 10. Portal do cliente

Login do cliente (hoje "sem conta de acesso própria") para abrir e acompanhar
chamados, estendendo a captação da landing. Requer autenticação para clientes como
novo tipo de principal, ou área com token. **Esforço:** Alto.

### 11. Dashboards operacionais

Agregações de SLA, resolução na primeira visita, produtividade por técnico e
backlog. A permissão `dashboard.ver` já existe. **Esforço:** Médio.

### 12. Webhooks / API pública

Assinaturas de eventos (reusa o log `ChamadoEvent`), entrega HTTP com retry e
chaves de API para integrações de clientes. **Esforço:** Médio/Alto.

---

## Ordem recomendada

1. **Notificações ao cliente (3).** Maior ganho de percepção pelo cliente e quase
   de graça: o provider Resend já está pronto.
2. **Registro de equipamentos (1).** É o que mais diferencia suporte em TI de field
   service genérico e encaixa limpo ao lado de clientes.
3. **SLA (parte da 4).** Barato sobre o schema atual e destrava os dashboards (11).
4. **Checklists (2)** e **assinatura (5)** para profissionalizar o RAT.
5. Demais itens conforme a demanda comercial.
