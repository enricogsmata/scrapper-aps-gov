// src/scrapers/pagamento.ts
import { Page } from "puppeteer";
import * as path from "path";
import { getPrimeNgDropdownOptionsCount, selectPrimeNgDropdownOption } from "../primeng_helpers.js";
import { new_logger } from "../services/logs.js";
import { setupDownloadBehavior, getFilesInDir, waitForNewDownloadAndRename } from "../downloader.js";

const logger = new_logger(import.meta.url);

export async function scrapePagamento(page: Page, moduleName: string, targetUrl: string): Promise<void> {
    const log = logger.forMethod('scrapePagamento');
    const downloadPath = path.resolve(process.cwd(), 'downloads', moduleName);

    await setupDownloadBehavior(page, downloadPath);

    log.info(`Navegando para ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'networkidle2' });

    const stateDropdownSelector = 'p-dropdown[inputid="estado"]';
    const yearDropdownSelector = 'p-dropdown[inputid="ano"]';
    const parcelaInicioSelector = 'p-dropdown[inputid="parcela-inicio"]';
    const parcelaFimSelector = 'p-dropdown[inputid="parcela-fim"]';
    const downloadBtnSelector = 'app-botao-download-excel button';

    log.info('Aguardando página carregar e dropdown de estados...');
    
    // Fallback para 0 caso o dropdown não esteja disponível imediatamente
    const statesCount = await getPrimeNgDropdownOptionsCount(page, stateDropdownSelector).catch(() => 0);

    log.info(`Encontrados ${statesCount > 0 ? statesCount - 1 : 0} estados. Iniciando extração...`);

    // Interações encadeadas (Estado -> Ano -> Parcela)
    for (let s = 1; s < statesCount; s++) {
        log.info(`Selecionando estado no índice ${s}...`);
        await selectPrimeNgDropdownOption(page, stateDropdownSelector, s);
        
        // Aguarda a atualização assíncrona do PrimeNG
        await new Promise(r => setTimeout(r, 1500)); 

        const yearsCount = await getPrimeNgDropdownOptionsCount(page, yearDropdownSelector).catch(() => 0);

        for (let y = 1; y < yearsCount; y++) {
            log.info(`Selecionando ano no índice ${y} para o estado ${s}...`);
            await selectPrimeNgDropdownOption(page, yearDropdownSelector, y);
            
            await new Promise(r => setTimeout(r, 1500));

            const parcelaInicioCount = await getPrimeNgDropdownOptionsCount(page, parcelaInicioSelector).catch(() => 0);
            const parcelaFimCount = await getPrimeNgDropdownOptionsCount(page, parcelaFimSelector).catch(() => 0);

            if (parcelaInicioCount > 1 && parcelaFimCount > 1) {
                // Seleciona o espectro completo de parcelas daquele ano
                await selectPrimeNgDropdownOption(page, parcelaInicioSelector, 1); 
                await selectPrimeNgDropdownOption(page, parcelaFimSelector, parcelaFimCount - 1); 
                
                await new Promise(r => setTimeout(r, 1000));

                const isBtnDisabled = await page.$eval(downloadBtnSelector, btn => btn.hasAttribute('disabled')).catch(() => true);

                if (!isBtnDisabled) {
                    const filesBefore = getFilesInDir(downloadPath);
                    await page.click(downloadBtnSelector);

                    await new Promise(r => setTimeout(r, 1000));

                    await page.waitForFunction(
                        (selector) => {
                            const btn = document.querySelector(selector);
                            return btn && !btn.hasAttribute('disabled');
                        },
                        { timeout: 60000 },
                        downloadBtnSelector
                    ).catch(() => {});

                    log.info(`Aguardando download no sistema de arquivos...`);
                    const safeName = `pagamento_est_${s}_ano_${y}_${Date.now()}`;
                    
                    await waitForNewDownloadAndRename(downloadPath, filesBefore, safeName).catch(err => {
                        log.error(`Erro ao aguardar o download: ${err.message}`);
                    });
                } else {
                    log.info(`Botão de download desabilitado para o estado ${s}, ano ${y}. Pulando.`);
                }
            }
        }
    }

    log.info('Extração finalizada para: Pagamento.');
}