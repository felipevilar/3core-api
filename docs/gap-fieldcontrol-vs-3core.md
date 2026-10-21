# Gap Field Control → 3core (chamados) — mapeamento e implementação

> Cruzamento do fluxo real do **Field Control** (ver `fluxo-chamados-fieldcontrol.md`)
> com o nosso sistema (API NestJS + `core-dashboard`). Atualizado em 2026-10-21.
> Legenda: ✅ implementado · 🟡 parcial · ⏳ previsto.

## Modelo adotado

```
chamados (OS)  1:N  chamado_visitas (visita = "Task")  1:N  chamado_visita_pausas
   │ visitaAtualId → visita em andamento (ou a última)
   └─ status/técnico/carimbos ESPELHAM a visita atual; `fechado`/`cancelado`
      são estados só do chamado; `aberto` = sem visita ativa.
clients ─ contratanteId (self-FK) ─ client_locais (sites) → chamados.localId
```

Contrato antigo preservado: `GET /chamados`, filtros, agenda, financeiro e o
dashboard continuam lendo os campos espelhados em `chamados`.

## Recurso a recurso

| # | Field Control | 3core | Onde |
|---|---|---|---|
| 1 | Order 1:N Task | ✅ `chamado_visitas`; `POST /chamados/:id/visitas` (retorno), `POST …/visitas/:vid/cancelar`, `GET …/visitas` | `chamados.service.ts` |
| 2 | Ticket aceite/expiração | ✅ `aceitoEm`, `solicitacaoExpiraEm` (config `solicitacaoExpiraHoras`), cron 5 min → `solicitacao_expirada` | `chamados.scheduler.ts` |
| 3 | Status `paused` | ✅ `pausado` + `POST …/pausar` / `…/retomar`; pausas registradas | |
| 4 | `receivedAt/viewedAt` | ✅ `aceitoEm`, `visualizadoEm` (1ª abertura pelo técnico) | |
| 5 | Coordenadas | ✅ lat/lng no local e no chamado; GPS em a-caminho/chegada/finalizar; `chegadaDistanciaM` | `common/geo.ts` |
| 6 | Códigos check-in/out | ✅ `codigoCheckin/Checkout` (local → chamado), validados; técnico vê só `exigeCodigo*` | |
| 7 | Assinatura | ✅ `POST …/assinatura/upload-url` + `finalizar.assinatura`; `GET …/visitas/:vid/assinatura/download-url` | |
| 8 | Rating | ✅ `finalizar.avaliacao` (1–5 + comentário) | |
| 9 | Duração | ✅ `duracaoPrevistaMin` (default do serviço) | |
| 10 | Rota do dia | ✅ `GET /chamados/minha-rota?data=`, `PATCH …/visitas/:vid/ordem` | |
| 11 | Comentários | ✅ `GET/POST/DELETE /chamados/:id/comentarios` + notificação | |
| 12 | Motivos classificados | ✅ `motivos` (`/configuracoes/motivos`), `motivoId` em cancelar/recusar/reabrir/pausar | |
| 13 | Catálogo de serviços | ✅ `/servicos`, `chamados.servicoId` (título/duração herdados) | `src/servicos/` |
| 14 | Locais do cliente | ✅ `/clients/:id/locais`, `chamados.localId` | `src/clients/` |
| 15 | Contratante | ✅ `clients.contratanteId`, filtro `?contratanteId=` | |
| 16 | SLA | ✅ `sla_politicas` (`/configuracoes/sla`), prazos no chamado, flags, filtro `slaEstourado`, cron 10 min + alerta | |
| 17 | Formulários / RAT digital | ⏳ roadmap item 2 | |
| 18 | Feature flags | ✅ `app_config` (`GET/PATCH /configuracoes`) | `src/configuracoes/` |
| 19 | archived/locked | ✅ `arquivadoEm` (`POST …/arquivar`/`desarquivar`, `?incluirArquivados`) | |
| 20 | Número externo | ✅ já existia; busca inclui externo/interno/técnico | |
| 21 | Jornada/contrato do técnico | ⏳ | |
| 23 | Push / sino | ✅ in-app (`/notificacoes`) via `CompositeNotifier`; e-mail ao cliente (a caminho/concluído) | `src/notificacoes/`, `src/notifications/` |
| 24 | Webhooks / API key | ⏳ roadmap item 12 | |
| 25 | Mapa operacional | ⏳ | |
| 26 | Contato no local | ✅ `contatoLocalNome/Telefone` | |

## Permissões novas
`configuracoes.gerenciar`, `servicos.ver`, `servicos.gerenciar` (técnico recebe `servicos.ver`).

## Migrations
`1783700000000-CreateChamadoVisitas` (trunca chamados — dados eram de teste),
`1783800000000-ClientLocaisContratante`, `1783900000000-CreateAppConfig`,
`1784000000000-FaseGestao`.

## Dev local
`DATABASE_SSL=false` permite Postgres local sem TLS. Fluxo completo validado por
script contra um banco local (criar cliente/local → chamado por serviço → visita 1
→ aceite → a caminho/chegada com GPS e código → pausa → finalizar com avaliação →
visita 2 → recusa → visita 3 cancelada → visita 4 finalizada → fechar → arquivar → reabrir).
