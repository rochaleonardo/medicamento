# Meu Acompanhamento

Aplicativo web instalável (PWA) para registrar percepções sobre funcionamento diário, sono, medicação e possíveis efeitos ou sensações ao longo de um tratamento medicamentoso.

O aplicativo é um diário pessoal. Não realiza diagnóstico, não determina se um medicamento está funcionando e não recomenda iniciar, interromper ou alterar doses.

## Termos de Uso

Antes do primeiro uso, o aplicativo apresenta os Termos de Uso e exige que o usuário marque a declaração de leitura e aceite. Sem esse aceite, as telas de cadastro, restauração e acompanhamento permanecem bloqueadas.

O aceite é registrado somente neste dispositivo, com a versão e a data dos termos. O texto completo continua disponível em **Configurações → Termos de Uso**. Quando a versão dos termos for alterada, o aplicativo solicitará um novo aceite.

O registro de aceite não é incluído nos backups JSON. Assim, restaurar dados em outro dispositivo não transfere automaticamente a concordância de outra instalação ou pessoa.

## Privacidade

Os dados ficam somente no navegador do dispositivo, armazenados no IndexedDB. Não há backend, conta externa, API paga, ferramenta de análise ou envio de dados a servidores. Apagar os dados do navegador, remover o site ou trocar de aparelho pode eliminar os registros; por isso, faça backups JSON periódicos.

## Estrutura

```text
dist/
  index.html
  styles.css
  app.js
  manifest.json
  service-worker.js
  icons/
    icon-192.png
    icon-512.png
    apple-touch-icon.png
    icon-source.svg
```

Todos os arquivos da pasta `dist` devem ser publicados juntos, preservando essa estrutura.

## Publicar no GitHub Pages

1. Crie um repositório no GitHub.
2. Envie **o conteúdo da pasta `dist`** para a raiz do repositório. O arquivo `index.html` deve ficar na raiz.
3. No repositório, abra **Settings → Pages**.
4. Em **Build and deployment**, escolha **Deploy from a branch**.
5. Selecione a branch `main`, a pasta `/ (root)` e clique em **Save**.
6. Aguarde a publicação e abra o endereço HTTPS informado pelo GitHub.

O modo offline e a instalação PWA exigem HTTPS. O GitHub Pages já fornece HTTPS.

## Instalar no iPhone/iPad

1. Abra o endereço publicado no **Safari**.
2. Toque em **Compartilhar**.
3. Escolha **Adicionar à Tela de Início**.
4. Confirme em **Adicionar**.

Abra o aplicativo ao menos uma vez com internet para que os arquivos essenciais sejam armazenados. Depois disso, ele poderá abrir offline.

## Instalar no Android

1. Abra o endereço publicado no Chrome.
2. Use o botão **Instalar app** quando aparecer ou abra o menu do navegador.
3. Escolha **Instalar aplicativo** ou **Adicionar à tela inicial**.
4. Confirme a instalação.

## Fazer backup

Abra **Backup e exportação** e toque em **Fazer backup agora**. Será baixado um arquivo com nome semelhante a:

`acompanhamento_backup_2026-09-22.json`

Guarde esse arquivo em local seguro. Ele contém perfil, configurações, avaliações e a identificação do marco inicial.

Em aparelhos compatíveis, use **Compartilhar JSON** para abrir o menu do sistema e salvar o arquivo em Arquivos, iCloud Drive, Google Drive ou outro destino disponível.

O aplicativo mostra a data do último backup externo e permite configurar lembretes a cada 7, 15 ou 30 dias. Quando o prazo é atingido, um aviso destacado aparece na tela inicial e na área de backup.

## Cópias internas automáticas

Após cada alteração de perfil, configuração ou avaliação, o aplicativo cria automaticamente uma cópia interna. São mantidas as cinco versões mais recentes. Essas cópias podem ser restauradas em **Backup e exportação → Cópias internas automáticas**.

As cópias internas ficam no mesmo dispositivo e ajudam a desfazer alterações acidentais, mas não substituem o backup JSON externo. Se os dados do navegador forem removidos, as cópias internas também poderão ser perdidas.

## Restaurar backup

Se for o primeiro acesso, use o botão **Restaurar um backup** exibido abaixo de **Começar acompanhamento**. Também é possível restaurar posteriormente seguindo estes passos:

1. Abra **Backup e exportação**.
2. Toque em **Selecionar arquivo**.
3. Selecione um backup JSON gerado pelo aplicativo.
4. Após a validação, escolha:
   - **Mesclar**: mantém os registros atuais e acrescenta os do backup, evitando duplicatas por identificador;
   - **Substituir**: apaga os dados atuais e usa os dados do backup;
   - **Cancelar**: não altera nada.

## Exportar para Excel

Use **Exportar CSV**. O arquivo é gerado em UTF-8 com BOM e separador por ponto e vírgula, configuração adequada para versões brasileiras do Excel. Cada linha corresponde a uma avaliação.

## Atualizações

Quando uma nova versão dos arquivos for publicada, o aplicativo informa que há atualização disponível. Atualizar o PWA troca somente os arquivos do aplicativo e não apaga o IndexedDB.

Versão atual: **1.3.0**.

## Desenvolvimento local

Para testar o Service Worker, sirva a pasta `dist` em um endereço local HTTP, por exemplo:

```bash
python3 -m http.server 8080 --directory dist
```

Abra `http://localhost:8080` para testar todos os recursos de PWA.

O arquivo `index.html` também pode ser aberto por duplo clique no computador para uso local. Nesse modo, o formulário e os registros funcionam, mas a instalação como PWA, o cache offline e as atualizações automáticas exigem publicação em HTTPS ou execução em `localhost`.
