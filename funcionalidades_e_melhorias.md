# Levantamento de Melhorias e Correções

## Abertura e Gestão de Chamados
* **Busca de CEP:** Consertar a integração de busca de CEP, que atualmente não funciona durante a abertura do chamado.
* **Subclientes:** Criar uma hierarquia ou sistema de "subclientes" para vincular chamados de um cliente principal a locais ou empresas secundárias, evitando a criação de cadastros aleatórios que prejudicam o faturamento.

## Atribuição de Técnicos
* **Filtro de Busca:** Refatorar o componente de seleção (dropdown) na tela "Atribuir técnico" para que a filtragem por digitação funcione em tempo real, eliminando a dependência exclusiva da barra de rolagem.
* **Exibição de Dados:** Alterar as informações exibidas na listagem de técnicos: substituir o e-mail pela cidade de origem ou número de telefone, facilitando a identificação rápida do profissional correto.

## Módulo Financeiro e Fechamento
* **Aprovação em Massa:** Adicionar um recurso de seleção múltipla (checkboxes) no dashboard financeiro para permitir a aprovação de vários chamados em massa, otimizando o processo manual de aprovar um por um.
* **Cópia de PIX:** Criar um botão de cópia rápida (copy-to-clipboard) com os dados bancários/PIX do técnico diretamente na tela de pagamentos.
* **Comprovantes de Pagamento:** Implementar uma funcionalidade de upload para anexar comprovantes de pagamento logo após a realização do repasse.
* **Correção de Bug (KM):** Corrigir o bug de quilometragem (KM) no fechamento: permitir que o valor inserido manualmente seja removido ou editado pelo usuário e corrigir a falha de gravação onde o sistema salva um valor diferente do digitado (ex: digita 88 e salva 40).
* **Limpeza Visual:** Realizar uma limpeza e reorganização visual no dashboard financeiro.