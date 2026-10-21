# Fluxo de Chamados — Field Control (produção)

> Mapeamento de como a feature de **chamados / ordens de serviço** funciona hoje no
> sistema **Field Control** (conta `88820` — 3CORE SUPORTE EM TECNOLOGIA LTDA, plano
> `corporate`). Levantado por inspeção direta da API de produção em 2026-10-21.
>
> **Legenda de confiança:** ✅ confirmado por resposta da API · 🔸 inferido a partir
> de campos/enum observados (não validado por transição real).

---

## 1. Visão geral da hierarquia

O domínio é dividido em **três entidades encadeadas**, não em um único "chamado":

```
Ticket (solicitação)  ──1:1──►  Order (OS / chamado)  ──1:N──►  Task (visita/agendamento)
   recebe o pedido              dados do serviço no campo        execução pelo técnico
```

- **Ticket** = a *solicitação* que entra (muitas vezes vinda de um sistema externo do
  contratante). Tem seu próprio status de aceite/expiração.
- **Order** = a *ordem de serviço* propriamente dita (o "chamado" como o usuário pensa):
  cliente, local, serviço, endereço, SLA, formulário, assinatura e valores.
- **Task** = cada *visita/agendamento* vinculada à Order e atribuída a um técnico. É aqui
  que vive a **máquina de estados de execução** (agendado → a caminho → em atendimento →
  concluído / cancelado).

> Observação importante: **a Order não tem um campo `status` próprio.** O andamento do
> chamado é lido a partir do status da(s) sua(s) **Task(s)**. ✅

---

## 2. Acesso / API (como o front conversa com o backend)

| Item | Valor |
|---|---|
| **Base da API (app Mordor)** | `https://api.fieldcontrol.com.br` (codinome interno "EyeOfSauron", `environment: prod`) ✅ |
| **Autenticação (web app)** | `POST https://blackgate.fieldcontrol.com.br/auth/sign-in` → retorna `token` (JWT) ✅ |
| **Header de auth da API** | `x-access-token: <jwt>` — **não** é `Authorization: Bearer` (Bearer devolve `401`) ✅ |
| **App FieldNews (separado)** | `POST https://nurn.fieldcontrol.com.br/apps/<appId>/authenticate` → `accessToken` próprio (outro escopo) ✅ |
| **Envelope de lista** | `{ "items": [...], "totalItems": <n>, "incompleteResults": <bool> }` ✅ |
| **Usuário logado** | `admin: true`, `scope: full_access`, `accountId: 88820` ✅ |

### Coleções observadas

| Endpoint | `totalItems` | Observação |
|---|---|---|
| `GET /orders` | **619** | ordens de serviço ✅ |
| `GET /tasks` | **642** | agendamentos/visitas ✅ |
| `GET /customers` | — | clientes ✅ |
| `GET /services` | — | catálogo de serviços ✅ |
| `GET /employees` | — | técnicos / células ✅ |
| `GET /users` | — | usuários do painel (**retorna array puro**, sem envelope `items`) ✅ |
| `GET /forms` | — | formulários/RAT ✅ |
| `GET /orders/:id` | — | detalhe ✅ |
| `GET /orders/:id/comments` | — | comentários da OS ✅ |
| `GET /orders/:id/forms` | — | formulários preenchidos na OS ✅ |
| `GET /tickets/:id` | — | detalhe da solicitação ✅ |

> ⚠️ Os filtros por query-string (`?status=...`, `?order=...`) foram **ignorados** nos
> testes — todas as variações devolveram o total cheio (642). A filtragem provavelmente
> usa outra sintaxe/parâmetro; confirmar antes de depender disso em integração. 🔸

---

## 3. Ticket (solicitação)

Representa o pedido que chega — frequentemente originado de um sistema externo do
contratante (ver seção 7).

Campos relevantes (`GET /tickets/:id`): ✅

- `id`, `identifier` / `number` (ex.: `1920#00009778`)
- `name` (cliente), `subject` (tipo de serviço), `message` (texto da solicitação)
- `status` — **`accepted`** no exemplo. Outros estados prováveis: `pending`, `expired`,
  `canceled` (há `acceptedAt` e `expiredAt`). 🔸
- `acceptedAt`, `createdAt`, `expiredAt`
- `contact { email, phone }`
- `metadata` (mesmo bloco espelhado na Order — ver abaixo)

---

## 4. Order (a OS / chamado)

`GET /orders/:id` ✅

### Identificação e conteúdo
- `id` (uuid), `identifier` (ex.: `C-261014141447-1920#00009778`)
- `description` — texto completo da solicitação (dados do site, equipamento, contato no
  local, necessidade de andaime, credenciamento etc.)
- `ticket { id }`, `deadline { id }`, `createdBy { id, type }`

### Partes relacionadas (referência por id)
- `customer { id }` — cliente (ex.: `TIM - REVENDA SHOPPING VIA NORTE | INFORCELL`)
- `service { id }` — serviço do catálogo (`duration` em minutos)
- `location { id }` — local/ponto
- `address { street, number, neighborhood, city, state, zipCode, formattedAddress, coords{latitude,longitude} }`
- `contractor { id, name }` — contratante (ex.: `Neooh`)

### Execução e financeiro
- `form` — formulário vinculado
- `signature { _id, path, signedAt, signedBy }` — assinatura do cliente, capturada na
  **conclusão** (ex.: `signedBy: "Paola Muzi"`, PNG no S3) ✅
- `totalValue`, `productsTotalValue`, `servicesTotalValue` (0 nos exemplos desta conta)
- `pmocId` — vínculo com PMOC (plano de manutenção), quando aplicável

### Flags de ciclo / estado
- `archived` — OS arquivada
- `locked` — OS travada (não editável)

### `metadata` (bloco rico, espelhado do ticket) ✅
- `problem { id, name }` — ex.: `Priorização Alta`
- `deadlineContract { id, name, deadlineAt, firstVisitDeadlineAt }` — **SLA** (prazo total
  e prazo da 1ª visita). Ex.: `SLA - MANUTENÇÃO COM TROCA`
- `callbacks: ["sammathnaur"]` + bloco `sammathnaur { account, maintenance{ id, number,
  openedAt, deadlineStartAt } }` — rastro da integração externa (ver seção 7)
- `equipments[]`, `locationSectors[]`, `locationEnvironments[]`
- Dezenas de **feature flags** por conta que controlam o que o técnico/gestor pode fazer
  (ex.: `featureValidateRequiredForms`, `featureDisableEditService`,
  `featureDisableDeleteTicket`, `featureCancelationDescriptionRequired`,
  `featureCreateTaskWithPastDate`, `featureHideCancelTicketButton`,
  `featureEnableCommentToCorporate`, `moduleVideosEnabled`…)

---

## 5. Task (visita / agendamento) — onde vive o andamento

`GET /tasks` · `GET /tasks/:id` ✅

Cada Task liga **uma Order a um técnico** para uma data/hora.

### Campos
- `id` (uuid), `_id` (numérico)
- `status` — **estado da execução** (ver máquina de estados abaixo)
- `order { id }` — a OS
- `employee { id }` — o **técnico atribuído**
- `scheduling { type, date, time }` — ex.: `type: "scheduled-date-and-time"`,
  `date: "2026-10-21"`, `time: "14:00:00"`
- `duration` — minutos previstos
- `coords { latitude, longitude }` — posição registrada
- `position` — ordem na rota do dia
- `security { startPasswordCode, completePasswordCode, metadata }` — senhas de
  check-in/check-out quando o cliente exige
- `rating` — avaliação do atendimento
- `reportedReason`, `statusDescription`, `statusClassificationId` — motivo/classificação
  (ex.: justificativa de cancelamento)
- `pmocId`, `account { id }`, `archived`

### Carimbos de tempo do ciclo (um por etapa) ✅
| Campo | Marca |
|---|---|
| `receivedAt` | técnico recebeu a task no app |
| `viewedAt` | técnico abriu/visualizou |
| `startedRouteAt` | iniciou deslocamento (a caminho) |
| `startedAt` | **check-in** — início do atendimento |
| `completedAt` | **check-out** — conclusão |

### Máquina de estados (status da Task)
Enum aceito pela API: `scheduled`, `received`, `viewed`, `on_route`, `started`,
`paused`, `done`, `canceled`. ✅ (fluxo inferido pelos carimbos de tempo 🔸)

```
scheduled ─► received ─► viewed ─► on_route ─► started ─► done
 (agendado)  (recebido)  (visto)  (a caminho) (em atend.) (concluído)
                                                  │
                                               paused (pausado) ─► started
     qualquer estado ativo ───────────────────────────────────► canceled
```

- `scheduled`: criada e agendada, ainda não iniciada (`startedAt: null`).
- `started`: em atendimento (há `startedAt`, sem `completedAt`).
- `done`: concluída — tipicamente acompanha `completedAt`, `signature` na Order e, quando
  exigido, `form`/RAT preenchido.
- `canceled`: cancelada — costuma exigir descrição (`featureCancelationDescriptionRequired`).

### Distribuição real observada (amostra de 200 tasks) ✅
`done`: 156 · `canceled`: 38 · `scheduled`: 6
→ o grosso da operação está concluído ou cancelado; poucas pendentes/agendadas no recorte.

---

## 6. Técnico (employee)

`GET /employees` ✅

- `id`, `_id` (uuid), `name`, `email`, `avatarUrl`
- `contract { hiredAt, firedAt, active }` — vínculo
- `workSchedule { start, end, ... }` — jornada (ex.: `08:00`–`18:00`)
- `address { ... , coords }` — base do técnico
- `device { id, registration, appVersion, platform, ... }` — aparelho do app mobile
- `inactivatedAt`, `preferences`
- Há registros que parecem **células/centrais** (ex.: `Field Sudeste`,
  `central@3coreonline.com.br`) além de técnicos individuais. 🔸

`GET /users` (array puro) ✅ — usuários do painel web (gestores/operação), com endereço,
`document_number`, `crea_cft`, `department`, versão do app etc.

---

## 7. Integração externa (contratante → Field Control)

O chamado nasce **fora** do Field Control e é injetado via integração: ✅

- `metadata.callbacks: ["sammathnaur"]` e o bloco `metadata.sammathnaur` carregam a origem:
  - `account { name: "Neooh", uuid }`
  - `maintenance { id, number, openedAt, deadlineStartAt }` — a *manutenção* no sistema do
    contratante (ex.: Neooh), que vira Ticket → Order aqui.
- O `identifier` da OS embute o número externo (`...-1920#00009778`), e o
  `deadlineContract` traz o **SLA contratual** (prazo total + prazo da 1ª visita) que
  dispara as violações de prazo.

> Em resumo: **Neooh (contratante) abre a manutenção → Field Control cria Ticket/Order →
> 3CORE agenda a Task para um técnico → técnico executa (check-in/out, form, assinatura) →
> `done` → retorno/callback ao contratante.**

---

## 8. Fluxo ponta a ponta (resumo)

1. **Entrada** — contratante (ex.: Neooh) abre manutenção; integração cria o **Ticket**
   (`status: accepted`) e a **Order** com cliente, local, serviço, endereço, SLA e descrição.
2. **Agendamento** — a operação 3CORE cria uma **Task** (`scheduled`) vinculando a Order a
   um **técnico** (`employee`) com data/hora e posição na rota.
3. **Despacho** — técnico recebe (`received`) e visualiza (`viewed`) no app mobile.
4. **Deslocamento** — `on_route` (`startedRouteAt`), com coordenadas.
5. **Atendimento** — **check-in** (`started`/`startedAt`); pode haver `paused`; preenche
   formulário/RAT se exigido (`featureValidateRequiredForms`).
6. **Conclusão** — **check-out** (`done`/`completedAt`) + **assinatura** do cliente na Order
   (`signature.signedBy/signedAt`) + eventual `rating`.
7. **Cancelamento** (alternativo) — `canceled` a partir de qualquer estado ativo, com
   descrição/motivo obrigatório.
8. **Fechamento financeiro/arquivo** — `totalValue`/`servicesTotalValue` na Order;
   `archived`/`locked` encerram edição; callback de volta ao contratante.

---

## 9. Pontos de atenção / investigação em produção

- **Status do chamado é derivado das Tasks**, não da Order. Uma Order pode ter várias
  Tasks (retornos/revisitas) — ao diagnosticar "chamado travado", olhar o status da Task
  mais recente, não da Order. ✅
- **Filtros por query-string parecem ignorados** (`status=`, `order=` devolveram total
  cheio). Confirmar a sintaxe real de filtro antes de confiar em contagens por status. 🔸
- **Muitas feature flags por conta** no `metadata` alteram o comportamento (edição,
  cancelamento, prazos retroativos, formulários obrigatórios). Divergências de
  comportamento entre OSs podem vir daí. ✅
- **SLA** vem de `deadlineContract` (prazo total + 1ª visita). Violações de prazo
  dependem desses campos vindos da integração. ✅
- **Dois escopos de autenticação distintos**: Mordor (`blackgate`/`api`, header
  `x-access-token`) e FieldNews (`nurn`, token de app). Não misturar tokens. ✅
