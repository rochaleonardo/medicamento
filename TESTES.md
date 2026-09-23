# Relatório de validação

Data: 23/09/2026

## Verificações automatizadas concluídas

- Sintaxe de `app.js` e `service-worker.js`.
- Integridade do HTML e inexistência de IDs duplicados.
- Existência de todos os recursos locais referenciados.
- Validade do `manifest.json`, modo `standalone`, orientação e caminhos relativos compatíveis com GitHub Pages.
- Dimensões reais dos ícones PNG: 192×192, 512×512 e 180×180.
- Integridade da lista de arquivos do cache offline.
- Presença das rotinas de IndexedDB, avaliação, marco inicial, gráficos, CSV, backup, restauração e exclusão.
- CSV configurado com UTF-8 BOM, separador por ponto e vírgula e uma linha por registro.
- Backup com versão, data, perfil, configurações, registros e marco inicial.
- Atualização do Service Worker sem operações de limpeza no IndexedDB.
- Criação e retenção das cinco cópias internas automáticas mais recentes.
- Indicador do último backup externo e cálculo de atraso em 7, 15 ou 30 dias.
- Compartilhamento do arquivo JSON pelo menu nativo quando suportado, com download como alternativa.
- Layout responsivo e Safe Area previstos no CSS.
- Bloqueio obrigatório antes do primeiro uso até a leitura e o aceite dos Termos de Uso.
- Registro local da versão e da data do aceite, sem exportação dessas informações no backup JSON.
- Consulta posterior do texto completo em Configurações e solicitação de novo aceite quando a versão dos termos mudar.

## Roteiro funcional preparado

O arquivo `tests/e2e.js` automatiza o seguinte fluxo quando executado em um ambiente com Chromium/Playwright disponível:

1. Confirmar que o aplicativo está bloqueado antes do aceite.
2. Marcar a declaração, aceitar os termos e confirmar a persistência após recarregar.
3. Criar perfil.
4. Criar o primeiro registro e defini-lo como marco inicial.
5. Editar o registro e gerar o gráfico.
6. Exportar e validar CSV.
7. Fazer e validar backup JSON, confirmando que ele não contém o aceite individual.
8. Excluir um registro e restaurar o backup.
9. Reabrir o aplicativo offline.

O navegador automatizado não pôde ser executado neste ambiente porque o binário gráfico não estava disponível. O roteiro permanece no projeto-fonte para repetição local.

## Verificações obrigatórias em aparelhos reais

Estas etapas dependem de publicação HTTPS e de dispositivos físicos:

- instalar no Android;
- adicionar à Tela de Início no iOS;
- conferir abertura offline após o primeiro carregamento;
- conferir download e abertura do CSV na versão de Excel utilizada pelo usuário;
- publicar uma nova versão do PWA e confirmar a atualização sem perda dos registros.

As instruções estão no `README.md`.
