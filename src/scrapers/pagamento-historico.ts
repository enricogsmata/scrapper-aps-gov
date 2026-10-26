// src/scrapers/pagamento-historico.ts
import { Page } from "puppeteer";
import * as path from "path";
import { new_logger } from "../services/logs.js";
import { setupDownloadBehavior, getFilesInDir, waitForNewDownloadAndRename } from "../downloader.js";

const logger = new_logger(import.meta.url);

const SELECTORS = [
    'select[name$=":uf"]',
    'select[name$=":municipio"]',
    'select[name$=":ano"], select[name$=":competencia"]',
    'select[name$=":compInicio"]',
    'select[name$=":compFim"]'
];

async function doHistoricalDownload(page: Page, downloadPath: string, prefix: string) {
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

    const filesBefore = getFilesInDir(downloadPath);

    log.info(`[${prefix}] Iniciando download histórico...`);
    await page.evaluate((sel) => {
        document.querySelector<HTMLInputElement>(sel)?.click();
    }, btnSelector);

    try {
        // Aguarda até 2 minutos, relatórios agregados podem demorar
        await waitForNewDownloadAndRename(downloadPath, filesBefore, prefix, 120000);
        log.info(`[${prefix}] Download histórico concluído com sucesso.`);
    } catch (error) {
        log.error({ data: JSON.stringify(error, null, 4) }, `[${prefix}] Falha no download histórico:`);
    }
}

async function processField(page: Page, fields: string[], currentIndex: number, currentPrefix: string, downloadPath: string) {
    const log = logger.forMethod('processField');

    if (currentIndex >= fields.length) {
        await doHistoricalDownload(page, downloadPath, currentPrefix);
        return;
    }

    const fieldSelector = fields[currentIndex];

    // Select2 oculta o select nativo (offsetParent === null), então checamos apenas existência e estado disabled
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
        return Array.from(el!.options)
            .map(o => o.value)
            .filter(v => v !== '' && v !== '99'); // Remove placeholders vazios e "99" (Selecione...)
    }, fieldSelector);

    if (options.length === 0) {
        log.warn(`[${currentPrefix}] Campo (${fieldSelector}) sem opções válidas disponíveis. Ramificação interrompida.`);
        return;
    }

    for (const opt of options) {
        await page.evaluate((sel, val) => {
            const jq = (window as any).$;
            if (jq && jq(sel).length) {
                // Via jQuery p/ Select2 (Garante os bindings do JSF)
                jq(sel).val(val).trigger('change');
            } else {
                // Fallback nativo
                const el = document.querySelector<HTMLSelectElement>(sel);
                if (el) {
                    el.value = val;
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }
        }, fieldSelector, opt);

        // Aguarda ciclo de atualização AJAX do JSF
        await new Promise(r => setTimeout(r, 1500));

        const nextPrefix = currentPrefix ? `${currentPrefix}_${opt}` : opt;
        await processField(page, fields, currentIndex + 1, nextPrefix, downloadPath);
    }
}

export async function scrapePagamentoHistorico(page: Page, downloadPath: string, targetUrl: string): Promise<void> {
    const log = logger.forMethod('scrapePagamentoHistorico');

    await setupDownloadBehavior(page, downloadPath);

    log.info(`Navegando para histórico: ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'networkidle2' });

    // Isola o nome da página (ex: relFinanciamentoParcela) para usar como prefixo
    const urlObj = new URL(targetUrl);
    const reportName = urlObj.pathname.split('/').pop()?.replace('.xhtml', '') || 'historico';

    await processField(page, SELECTORS, 0, reportName, downloadPath);

    log.info(`Extração finalizada para histórico: ${reportName}`);
}