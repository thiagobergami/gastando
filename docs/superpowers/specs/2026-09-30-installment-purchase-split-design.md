# Divisão de compra parcelada com outra pessoa

Data: 2026-09-30
Status: desenho em conversa aprovado; especificação aguardando revisão.

## Objetivo e escopo

Permitir dividir uma compra parcelada com uma pessoa, por porcentagem, e acompanhar o recebimento de cada parcela separadamente. O usuário confirmou o exemplo: compra de R$ 1.200 em 6 vezes, dividida 50%, gera R$ 100 a receber por parcela.

O valor integral continua contando no cartão, no orçamento e nas projeções de poupança. A divisão é uma anotação de valores a receber, conforme o split existente. Marcar recebido não cria uma entrada de renda.

Primeira versão: uma pessoa, porcentagem inteira de 1 a 99 e recebimento integral por parcela. Várias pessoas, valor fixo, recebimento parcial, recibos e automação de cobrança ficam fora do escopo. Recorrência continua incompatível com parcelamento e split no formulário.

## Abordagem

A pessoa e a porcentagem pertencem ao grupo da compra; o estado recebido/pendente pertence a cada transação de parcela. Isso evita configurações divergentes entre parcelas e permite reaproveitar os endpoints existentes de recebimento.

Alternativas consideradas: copiar pessoa/porcentagem para cada parcela exigiria sincronizar várias fontes de verdade; introduzir um modelo geral de rateio com participantes e pagamentos excederia este escopo.

## Modelo e compatibilidade

Nova migração, usando o próximo número livre (atualmente 012), adiciona `split_person_id` e `split_percent` a `installment_groups`. Ambos são nulos juntos ou preenchidos juntos; a pessoa referencia `people`, e a porcentagem deve ser inteira entre 1 e 99. As compras existentes começam com ambos nulos.

`transactions.split_received` continua armazenando 0/1. Para grupos com split, os campos físicos `transactions.split_person_id` e `split_percent` permanecem nulos: as leituras resolvem a configuração pelo grupo e a expõem nos campos existentes do contrato `Transaction`. Para transações avulsas, a configuração continua na própria transação.

Todas as leituras relevantes devem resolver o split efetivo: listagem, busca por id, primeira parcela do grupo, valores a receber e validação de marcar/desmarcar recebido. Entidades e contratos de repositório devem explicitar quando os campos representam a configuração efetiva, em vez da linha física.

Embora criar parcelamento com split seja bloqueado hoje, editar uma parcela permite gravar um split individual. Esses dados legados não serão apagados ou convertidos automaticamente. Grupos sem configuração de split continuam exibindo seus splits individuais existentes. Adicionar split ao grupo que tenha qualquer split individual retorna 409, orientando remover as divisões individuais primeiro. Alterações financeiras nesse grupo legado também são bloqueadas até a remoção dos splits individuais; alterações descritivas e quitação preservam esses registros. Remover um split individual já recebido exige antes desmarcar seu recebimento.

Pessoas inativas continuam resolvíveis para compras existentes, como no split atual. O seletor oferece pessoas ativas e mantém visível a pessoa atual mesmo que tenha sido desativada.

## Cálculo dos valores

A expansão da compra continua usando `splitCents(total_cents, count)`, preservando exatamente o total cobrado. Exigir `count <= total_cents` para que nenhuma parcela tenha valor zero.

O total da outra pessoa é o percentual do valor integral, arredondado ao centavo mais próximo, com meio centavo arredondado para cima. Para evitar diferenças na soma, calcular a participação de cada parcela pela diferença entre os valores percentuais acumulados arredondados:

`a_receber[i] = arredondar(acumulado[i] * percentual / 100) - arredondar(acumulado[i-1] * percentual / 100)`.

Usar a ordem `installment_no`, nunca a data, pois a quitação antecipada pode mover várias parcelas para o mesmo mês. Calcular sobre todas as parcelas, inclusive recebidas e futuras, antes de qualquer filtro da listagem. Os cálculos pertencem a um serviço puro de domínio compartilhado pelas consultas e pela prévia de criação.

Exemplo de centavos: compra de R$ 1,00 em três parcelas de R$ 0,34, R$ 0,33 e R$ 0,33, dividida 50%, gera R$ 0,17, R$ 0,17 e R$ 0,16 a receber, totalizando R$ 0,50.

Não gravar o valor derivado a receber. Parcelas cujo valor a receber seja zero não aparecem como pendência nem contam nos totais. Splits avulsos e legados mantêm seu arredondamento atual por transação.

## API e responsabilidades

- `POST /api/transactions` aceita parcelamento com `split_person_id` e `split_percent`; valida o par, a faixa, a existência da pessoa e as referências existentes. Criar grupo e parcelas é atômico, todas inicialmente pendentes.
- `GET /api/installment-groups` retorna também pessoa, nome, porcentagem e indicação de splits individuais legados, para editar a configuração corretamente.
- `PUT /api/installment-groups/:id` aceita o par de split. Campos omitidos preservam o split existente; ambos explicitamente nulos removem a divisão. Um par incompleto é erro 400. Atualização e validação do estado recebido ocorrem na mesma transação de banco.
- `GET /api/transactions/receivables` mantém os campos atuais e acrescenta `installment_group_id`, `installment_no` e `installment_total`, nulos para transações avulsas. Retorna recebidos e pendentes, inclusive futuros, para a interface oferecer a reversão.
- `POST` e `DELETE /api/transactions/:id/split-received` resolvem o split efetivo e alteram somente a parcela indicada; 404 para transação inexistente e 400 se não houver divisão.

Os casos de uso validam referências e políticas; o serviço de domínio calcula centavos; os repositórios garantem operações atômicas e leituras consistentes; controladores validam os corpos e apresentam erros. Não criar um subsistema novo de pagamentos.

## Edição, recebimento e exclusão

Alterações em descrição, categoria ou cartão atualizam grupo e parcelas em lugar, preservando ids, datas, valores e recebimentos. Não reexpandir parcelas nessas alterações.

Valor total, quantidade, primeiro mês, pessoa e porcentagem são alterações financeiras. Se houver qualquer parcela recebida, rejeitar com 409 e uma mensagem orientando desmarcar os recebimentos antes da correção. Não restaurar recebimentos por posição após recriar parcelas.

Sem recebimentos ou splits individuais legados, alterações financeiras podem reexpandir a compra atomicamente, com parcelas pendentes. Adicionar divisão a uma compra existente aplica a pessoa/porcentagem a todas as parcelas, inclusive as de meses anteriores. A interface explicita esse alcance.

Para uma compra compartilhada, edição e exclusão de parcela isolada são bloqueadas pelo backend com 409 e direcionadas à compra. Marcar/desmarcar recebido continua permitido por parcela. Compras sem split mantêm os fluxos existentes, respeitando a proteção dos splits individuais legados descrita acima.

Excluir a compra inteira remove todas as parcelas e seus estados de recebimento, com a confirmação já existente na interface explicitando que os valores a receber também serão removidos.

Quitar antecipadamente continua movendo apenas as datas das parcelas futuras para o mês selecionado. Não altera valores, ordem, configuração de divisão ou estado recebido. Essa operação fica permitida mesmo quando há recebimentos, pois não recalcula a dívida; a data apresentada em A receber acompanha a data atual da parcela. Pagamento do cartão e recebimento da pessoa são estados independentes.

## Interface

### Registrar

Parcelamento e divisão passam a ser opções compatíveis. Recorrência continua exclusiva; ao selecioná-la, limpar/desativar divisão e parcelamento. Reset e início de edição preenchem os estados sem enviar campos ocultos residuais.

Mostrar pessoa, porcentagem identificada como a parte da outra pessoa e uma prévia, por exemplo: “6 parcelas de R$ 200 · Ana deve R$ 100 por parcela”. Se o arredondamento produzir valores diferentes, apresentar a faixa e o total a receber, evitando prometer parcelas iguais.

Linhas de transação exibem as duas etiquetas, por exemplo `2/6` e `50% Ana`. Editar uma parcela de compra compartilhada direciona ao formulário da compra em `parcelas.html`, identificada pelo id do grupo.

### Gestão da compra

Adicionar pessoa e porcentagem ao formulário de edição de `parcelas.html`, preenchendo corretamente também categoria e cartão. A compra exibe sua divisão e permite adicioná-la/removê-la conforme as regras de edição. Informar conflitos legados e bloqueios por recebimento sem perder o formulário preenchido.

### A receber

Manter carregamento independente do dashboard. Mostrar pessoa, descrição, parcela `n/N`, mês e valor. Separar pendências de meses anteriores/do mês atual de parcelas futuras, usando o mês corrente real como referência, independente do mês selecionado no dashboard.

Exibir subtotais “A receber até este mês” e “Previsto para os próximos meses”, além do total pendente de ambos. Ordenar cada seção por mês ascendente e número da parcela. A classificação não implica uma data de vencimento ou atraso formal.

Marcar recebido remove apenas a parcela correspondente das pendências. Permitir marcar também uma parcela futura, caso a pessoa pague antecipadamente. Uma seção recolhível “Recebidos” permite desmarcar um recebimento após recarregar a página; mostrar o painel também quando houver somente recebidos. Não introduzir histórico de datas/valores de pagamento.

## Validação e critérios de aceite

1. Criar R$ 1.200 em 6 vezes com 50% gera seis parcelas de R$ 200 e seis valores de R$ 100 a receber.
2. Marcar a segunda como recebida reduz o total pendente de R$ 600 para R$ 500, sem afetar as demais; desmarcar restaura o total.
3. O exemplo de centavos produz R$ 0,17 + R$ 0,17 + R$ 0,16, com total exato, inclusive após filtros e recebimentos.
4. Alterações descritivas preservam ids e recebimentos; alterações financeiras após recebimento retornam 409 sem mudanças parciais.
5. Adicionar split a uma compra existente sem conflitos funciona; omissão em edição preserva; nulos removem quando permitido.
6. Edição/exclusão individual de compra compartilhada é bloqueada; quitação antecipada preserva valores e recebimentos.
7. Splits individuais legados continuam legíveis e não são descartados; tentativa de dividir o grupo com esses registros retorna 409.
8. Migração deixa compras antigas sem split; referências e porcentagens inválidas falham; erros revertem toda a operação.
9. Interface permite as duas opções simultâneas, exibe a prévia e etiquetas, distingue previstos e permite desfazer recebido após reload.
10. Orçamento, dashboard, projeções e splits avulsos mantêm seus resultados financeiros atuais.

Cobrir serviço de cálculo, migração, repositórios, integração HTTP e renderização dos fluxos. Na implementação, executar os testes relevantes, a suíte completa, typecheck e lint; verificar manualmente criação, edição, recebimento e reversão no navegador quando disponível. Esta etapa de especificação não modifica código de produto nem exige execução de testes.

## Sequência para o plano de implementação

1. Migração, contratos e serviço de cálculo.
2. Persistência, resolução do split efetivo e políticas de edição.
3. Schemas e endpoints, com testes de integração.
4. Registrar e gestão da compra.
5. A receber, reversão e regressões financeiras.

O plano detalhado de implementação será escrito após a revisão desta especificação. A implementação começa após a revisão do plano e a escolha do modo de execução.
