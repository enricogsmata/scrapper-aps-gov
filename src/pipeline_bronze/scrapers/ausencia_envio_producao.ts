// src/scrapers/ausencia_envio_producao.ts
import { Page } from "puppeteer";
import * as path from "path";
import { getPrimeNgDropdownOptionsCount, selectPrimeNgDropdownOption } from "../primeng_helpers.js";
import { new_logger } from "../../services/logs.js";
import {
    setupDownloadBehavior,
    triggerDownloadAndSave,
    realClick,
    formatError,
    safeRunCombination
} from "../downloader.js";

const logger = new_logger(import.meta.url);

export async function scrapeAusenciaEnvioProducao(page: Page, moduleName: string, targetUrl: string): Promise<void> {
    const log = logger.forMethod('scrapeAusenciaEnvioProducao');

    const urlObj = new URL(targetUrl);
    const treatedLinkName = urlObj.pathname.split('/').filter(Boolean).join('-').toLowerCase() || 'ausencia-envio-producao';
    const downloadPath = path.resolve(process.cwd(), 'downloads', moduleName, treatedLinkName);

    await setupDownloadBehavior(page, downloadPath);

    log.info(`Navegando para ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'networkidle2' });

    const dropdownSelector = 'p-dropdown[inputid="comp-dropdown"]';
    const downloadBtnSelector = 'app-botao-download-excel button';

    log.info('Aguardando dropdown de competências...');
    const optionsCount = await getPrimeNgDropdownOptionsCount(page, dropdownSelector);

    log.info(`Encontradas ${optionsCount} competências. Iniciando extração...`);

    for (let i = 1; i < optionsCount; i++) {
        await safeRunCombination(`comp-${i}`, async () => {
            log.info(`Selecionando competência no índice ${i}...`);
            await selectPrimeNgDropdownOption(page, dropdownSelector, i);

            // Aguarda a tabela/loading finalizar
            await page.waitForSelector('app-loading .carregando', { hidden: true, timeout: 60000 }).catch(() => { });

            log.info(`Verificando botão de download para competência ${i}...`);
            await page.waitForSelector(downloadBtnSelector, { visible: true });

            const isBtnDisabled = await page.$eval(downloadBtnSelector, (btn) => btn.hasAttribute('disabled'));
            if (!isBtnDisabled) {
                const safeName = `ausencia_envio_competencia_${i}`;
                const savedPath = await triggerDownloadAndSave(page, {
                    downloadPath,
                    fileName: safeName,
                    trigger: () => realClick(page, downloadBtnSelector),
                    startTimeout: 30000,
                    finishTimeout: 180000,
                    retries: 2,
                    retryDelayMs: 15000,
                });
                log.info(`[${safeName}] Download concluído com sucesso: ${savedPath}`);
            } else {
                log.info(`Botão de download desabilitado para o índice ${i}. Pulando.`);
            }
        });
    }

    log.info('Extração finalizada para: Ausência de envio de produção.');
}