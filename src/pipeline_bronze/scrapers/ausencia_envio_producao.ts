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
    safeDownloadJsonFromResponse,
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
    const verTelaBtnSelector = 'app-botao[arialabel="Ver em tela"] button, button[aria-label="Ver em tela"]';

    log.info('Aguardando dropdown de competências...');
    const optionsCount = await getPrimeNgDropdownOptionsCount(page, dropdownSelector);

    log.info(`Encontradas ${optionsCount} competências. Iniciando extração...`);

    for (let i = 1; i < optionsCount; i++) {
        await safeRunCombination(`comp-${i}`, async () => {
            log.info(`Selecionando competência no índice ${i}...`);
            await selectPrimeNgDropdownOption(page, dropdownSelector, i);

            // Aguarda a tabela/loading finalizar
            await page.waitForSelector('app-loading .carregando', { hidden: true, timeout: 60000 }).catch(() => { });

            const safeName = `ausencia_envio_competencia_${i}`;

            const isVerTelaDisabled = await page.evaluate((sel) => {
                const el = document.querySelector<HTMLButtonElement>(sel);
                return !el || el.disabled || el.classList.contains('p-disabled') || el.hasAttribute('disabled');
            }, verTelaBtnSelector);

            if (!isVerTelaDisabled) {
                log.info(`[${safeName}] Botão "Ver em tela" habilitado. Capturando requisição JSON...`);
                try {
                    await safeDownloadJsonFromResponse(
                        page,
                        downloadPath,
                        safeName,
                        async () => {
                            await realClick(page, verTelaBtnSelector);
                        },
                        '/credenciamento/sujeitos-suspensao',
                        { retries: 2, retryDelayMs: 3000 }
                    );
                    return;
                } catch (error) {
                    log.warn({ data: formatError(error) }, `[${safeName}] Falha ao obter JSON via "Ver em tela". Tentando fallback para download...`);
                }
            }

            log.info(`Verificando botão de download para competência ${i}...`);
            await page.waitForSelector(downloadBtnSelector, { visible: true });

            const isBtnDisabled = await page.$eval(downloadBtnSelector, (btn) => btn.hasAttribute('disabled'));
            if (!isBtnDisabled) {
                const savedPath = await triggerDownloadAndSave(page, {
                    downloadPath,
                    fileName: safeName,
                    trigger: () => realClick(page, downloadBtnSelector),
                    startTimeout: 60000,
                    finishTimeout: 300000,
                    retries: 3,
                    retryDelayMs: 5000,
                });
                log.info(`[${safeName}] Download concluído com sucesso: ${savedPath}`);
            } else {
                log.info(`Ambos os métodos indisponíveis para o índice ${i}. Pulando.`);
            }
        });
    }

    log.info('Extração finalizada para: Ausência de envio de produção.');
}