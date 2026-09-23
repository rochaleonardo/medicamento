# Relatório de validação

Data: 22/09/2026

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

## Roteiro funcional preparado

O arquivo `tests/e2e.js` automatiza o seguinte fluxo quando executado em um ambiente com Chromium/Playwright disponível:

1. Criar perfil.
2. Criar o primeiro registro e defini-lo como marco inicial.
3. Recarregar e confirmar persistência.
4. Editar o registro.
5. Gerar o gráfico.
6. Exportar e validar CSV.
7. Fazer e validar backup JSON.
8. Excluir um registro.
9. Restaurar o backup.
10. Reabrir o aplicativo offline.

O navegador automatizado não pôde ser executado neste ambiente porque o binário gráfico não estava disponível. O roteiro permanece no projeto-fonte para repetição local.

## Verificações obrigatórias em aparelhos reais

Estas etapas dependem de publicação HTTPS e de dispositivos físicos:

- instalar no Android;
- adicionar à Tela de Início no iOS;
- conferir abertura offline após o primeiro carregamento;
- conferir download e abertura do CSV na versão de Excel utilizada pelo usuário;
- publicar uma nova versão do PWA e confirmar a atualização sem perda dos registros.

As instruções estão no `README.md`.
