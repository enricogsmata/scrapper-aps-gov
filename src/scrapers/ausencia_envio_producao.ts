// src\scrapers\ausencia_envio_producao.ts
import { Page } from "puppeteer";
import * as path from "path";
import { getPrimeNgDropdownOptionsCount, selectPrimeNgDropdownOption } from "../primeng_helpers.js";
import { new_logger } from "../services/logs.js";
import { setupDownloadBehavior, getFilesInDir, waitForNewDownloadAndRename } from "../downloader.js";

const logger = new_logger(import.meta.url);

export async function scrapeAusenciaEnvioProducao(page: Page, moduleName: string, targetUrl: string): Promise<void> {
    const log = logger.forMethod('scrapeAusenciaEnvioProducao');
    const downloadPath = path.resolve(process.cwd(), 'downloads', moduleName);

    await setupDownloadBehavior(page, downloadPath);

    log.info(`Navegando para ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'networkidle2' });

    const dropdownSelector = 'p-dropdown[inputid="comp-dropdown"]';
    const downloadBtnSelector = 'app-botao-download-excel button';

    log.info('Aguardando dropdown de competências...');
    const optionsCount = await getPrimeNgDropdownOptionsCount(page, dropdownSelector);

    log.info(`Encontradas ${optionsCount} competências. Iniciando extração...`);

    // Ignorando o índice 0 se for um placeholder como "Selecione uma competência" 
    // ou ajustando a iteração caso todas sejam válidas. Assumindo que a 0 é placeholder se disabled.
    for (let i = 1; i < optionsCount; i++) {
        log.info(`Selecionando competência no índice ${i}...`);

        await selectPrimeNgDropdownOption(page, dropdownSelector, i);

        // Aguarda a tabela/loading finalizar (depende do spinner da aplicação)
        await page.waitForSelector('app-loading .carregando', { hidden: true, timeout: 60000 }).catch(() => { });

        log.info(`Clicando em download para competência ${i}...`);
        await page.waitForSelector(downloadBtnSelector, { visible: true });

        const isBtnDisabled = await page.$eval(downloadBtnSelector, btn => btn.hasAttribute('disabled'));
        if (!isBtnDisabled) {
            const filesBefore = getFilesInDir(downloadPath);

            await page.click(downloadBtnSelector);

            // Aguarda a interface reagir ao clique e desabilitar o botão
            await new Promise(r => setTimeout(r, 1000));

            // Aguarda até que o botão esteja habilitado novamente (geração do arquivo concluída)
            await page.waitForFunction(
                (selector) => {
                    const btn = document.querySelector(selector);
                    return btn && !btn.hasAttribute('disabled');
                },
                { timeout: 60000 },
                downloadBtnSelector
            );

            log.info(`Aguardando download no sistema de arquivos para o índice ${i}...`);
            const safeName = `ausencia_envio_competencia_${i}_${Date.now()}`;
            await waitForNewDownloadAndRename(downloadPath, filesBefore, safeName);
        } else {
            log.info(`Botão de download desabilitado para o índice ${i}. Pulando.`);
        }
    }

    log.info('Extração finalizada para: Ausência de envio de produção.');
}