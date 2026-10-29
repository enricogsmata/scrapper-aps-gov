// src/scrapers/pagamento-historico.ts
import { Page } from "puppeteer";
import { new_logger } from "../../services/logs.js";
import {
    setupDownloadBehavior,
    triggerDownloadAndSave,
    realClick,
    formatError,
    safeRunCombination
} from "../downloader.js";

const logger = new_logger(import.meta.url);

const SELECTORS = [
    'select[name$=":uf"]',
    'select[name$=":municipio"]',
    'select[name$=":ano"], select[name$=":competencia"]',
    'select[name$=":compInicio"]',
    'select[name$=":compFim"]'
];

async function doHistoricalDownload(page: Page, downloadPath: string, prefix: string): Promise<void> {
    const log = logger.forMethod('doHistoricalDownload');
    const btnSelector = 'input[type="submit"][id*="Download"]';

    const isBtnAvailable = await page.evaluate((sel) => {
        const btn = document.querySelector<HTMLInputElement>(sel);
        return btn && !btn.disabled;
    }, btnSelector);

    if (!isBtnAvailable) {
        log.warn(`[${prefix}] Botão de download histórico não disponível.`);
        return;
    }

    log.info(`[${prefix}] Iniciando download histórico...`);

    try {
        const savedPath = await triggerDownloadAndSave(page, {
            downloadPath,
            fileName: prefix,
            trigger: () => realClick(page, btnSelector),
            startTimeout: 30000,
            finishTimeout: 180000,
            retries: 2,
            retryDelayMs: 3000,
        });
        log.info(`[${prefix}] Download histórico concluído com sucesso: ${savedPath}`);
    } catch (error) {
        log.error({ data: formatError(error) }, `[${prefix}] Falha no download histórico:`);
    }
}

async function processField(
    page: Page,
    fields: string[],
    currentIndex: number,
    currentPrefix: string,
    downloadPath: string
): Promise<void> {
    const log = logger.forMethod('processField');

    if (currentIndex >= fields.length) {
        await doHistoricalDownload(page, downloadPath, currentPrefix);
        return;
    }

    const fieldSelector = fields[currentIndex];

    const isAvailable = await page.evaluate((sel) => {
        const el = document.querySelector<HTMLSelectElement>(sel);
        return el && !el.disabled;
    }, fieldSelector);

    if (!isAvailable) {
        await processField(page, fields, currentIndex + 1, currentPrefix, downloadPath);
        return;
    }

    const options = await page.evaluate((sel) => {
        const el = document.querySelector<HTMLSelectElement>(sel);
        return Array.from(el?.options || [])
            .map(o => o.value)
            .filter(v => v !== '' && v !== '99');
    }, fieldSelector);

    if (options.length === 0) {
        log.warn(`[${currentPrefix}] Campo (${fieldSelector}) sem opções válidas disponíveis.`);
        return;
    }

    for (const opt of options) {
        const nextPrefix = currentPrefix ? `${currentPrefix}_${opt}` : opt;
        await safeRunCombination(nextPrefix, async () => {
            await page.evaluate((sel, val) => {
                const jq = (window as any).$;
                if (jq && jq(sel).length) {
                    jq(sel).val(val).trigger('change');
                } else {
                    const el = document.querySelector<HTMLSelectElement>(sel);
                    if (el) {
                        el.value = val;
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                }
            }, fieldSelector, opt);

            await new Promise(r => setTimeout(r, 1500));
            await processField(page, fields, currentIndex + 1, nextPrefix, downloadPath);
        });
    }
}

export async function scrapePagamentoHistorico(page: Page, downloadPath: string, targetUrl: string): Promise<void> {
    const log = logger.forMethod('scrapePagamentoHistorico');

    await setupDownloadBehavior(page, downloadPath);

    log.info(`Navegando para histórico: ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'networkidle2' });

    const urlObj = new URL(targetUrl);
    const reportName = urlObj.pathname.split('/').pop()?.replace('.xhtml', '') || 'historico';

    await processField(page, SELECTORS, 0, reportName, downloadPath);

    log.info(`Extração finalizada para histórico: ${reportName}`);
}