const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await chromium.launch({headless:true});
  const context = await browser.newContext({acceptDownloads:true, viewport:{width:390,height:844}});
  const page = await context.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  await page.goto('http://127.0.0.1:4173', {waitUntil:'networkidle'});
  if(!(await page.locator('#setup-import-json').isVisible())) throw new Error('Restauração não está disponível no primeiro acesso');

  await page.fill('#setup-name','Leonardo');
  await page.fill('#setup-start-date','2026-09-15');
  await page.fill('#setup-medication','Medicamento de teste');
  await page.fill('#setup-active','Princípio ativo de teste');
  await page.fill('#setup-dose','40');
  await page.click('#setup-form button[type=submit]');
  await page.waitForSelector('#dashboard-view:not(.hidden)');

  await page.click('[data-go="evaluation"]');
  await page.fill('#concrete-example','Consegui concluir um relatório sem interrupções.');
  await page.check('.effect-check[data-effect="insomnia"]');
  await page.selectOption('.effect-level[data-effect="insomnia"]','2');
  await page.fill('#sleep-start','23:00');
  await page.fill('#sleep-end','06:30');
  await page.fill('#awakenings','2');
  await page.click('#evaluation-form button[type=submit]');
  await page.waitForSelector('#history-view:not(.hidden)');
  if(await page.locator('.record-card').count() !== 1) throw new Error('Registro não foi criado');
  if(!(await page.locator('.baseline-tag').isVisible())) throw new Error('Marco inicial não foi definido');

  await page.reload({waitUntil:'networkidle'});
  await page.waitForSelector('#dashboard-view:not(.hidden)');
  await page.click('[data-go="history"]');
  if(await page.locator('.record-card').count() !== 1) throw new Error('Persistência após recarga falhou');

  await page.click('[data-action="edit"]');
  await page.fill('#attention','8');
  await page.dispatchEvent('#attention','input');
  await page.click('#evaluation-form button[type=submit]');
  await page.waitForSelector('#history-view:not(.hidden)');

  await page.click('[data-go="evolution"]');
  await page.waitForSelector('#evolution-chart:not(.hidden)');
  if(await page.locator('#evolution-chart').getAttribute('width') === null) throw new Error('Gráfico não foi desenhado');

  await page.click('[data-go="backup"]');
  if(await page.locator('.snapshot-item').count() < 1) throw new Error('Cópia interna automática não foi criada');
  if(!(await page.locator('input[name="backupInterval"][value="7"]').isChecked())) throw new Error('Intervalo padrão de backup incorreto');
  const csvPromise=page.waitForEvent('download'); await page.click('#export-csv'); const csv=await csvPromise; const csvPath=await csv.path();
  const csvText=fs.readFileSync(csvPath,'utf8');
  if(!csvText.startsWith('\uFEFF') || !csvText.includes(';') || !csvText.includes('Medicamento de teste')) throw new Error('CSV inválido');
  const jsonPromise=page.waitForEvent('download'); await page.click('#export-json'); const jsonDownload=await jsonPromise; const jsonPath=await jsonDownload.path();
  const backup=JSON.parse(fs.readFileSync(jsonPath,'utf8')); if(backup.records.length!==1||!backup.baselineId)throw new Error('Backup JSON inválido');
  if(!(await page.locator('#backup-status').textContent()).includes('Último backup externo')) throw new Error('Indicador do último backup ausente');

  await page.click('[data-go="history"]');
  await page.click('[data-action="delete"]');
  await page.click('#modal-actions .button-danger');
  await page.waitForSelector('.record-card',{state:'detached'});
  if(await page.locator('.record-card').count()!==0) throw new Error('Exclusão falhou');

  await page.click('[data-go="backup"]');
  await page.setInputFiles('#import-json',jsonPath);
  await page.waitForSelector('#modal-backdrop:not(.hidden)');
  await page.click('#modal-actions .button-primary');
  await page.waitForSelector('#dashboard-view:not(.hidden)');
  await page.click('[data-go="history"]');
  if(await page.locator('.record-card').count()!==1) throw new Error('Restauração falhou');

  await context.setOffline(true);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForSelector('#dashboard-view:not(.hidden)');
  await page.click('[data-go="history"]');
  if(await page.locator('.record-card').count()!==1)throw new Error('Modo offline falhou');
  await context.setOffline(false);

  if(errors.length) throw new Error('Erros no navegador: '+errors.join(' | '));
  console.log('E2E OK: perfil, registro, marco inicial, persistência, edição, gráfico, CSV, JSON, exclusão, restauração e modo offline.');
  await browser.close();
})().catch(error=>{console.error(error);process.exit(1);});
