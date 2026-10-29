// src/scrapers/historico_pagamento_index.ts
import { Page } from "puppeteer";
import * as path from "path";
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
    'select[name$=":competenciaInicio"]',
    'select[name$=":compFim"]'
];

async function doDownloadOutros(page: Page, downloadPath: string, prefix: string): Promise<void> {
    const log = logger.forMethod('doDownloadOutros');
    const btnSelector = 'input[type="submit"][id$=":Download"]';

    const isBtnAvailable = await page.evaluate((sel) => {
        const btn = document.querySelector<HTMLInputElement>(sel);
        return btn && !btn.disabled;
    }, btnSelector);

    if (!isBtnAvailable) {
        log.warn(`[${prefix}] Botão de download não disponível.`);
        return;
    }

    log.info(`[${prefix}] Iniciando download...`);

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
        log.info(`[${prefix}] Download concluído com sucesso: ${savedPath}`);
    } catch (error) {
        log.error({ data: formatError(error) }, `[${prefix}] Falha no download:`);
    }
}

async function processFieldOutros(
    page: Page,
    fields: string[],
    currentIndex: number,
    currentPrefix: string,
    downloadPath: string
): Promise<void> {
    const log = logger.forMethod('processFieldOutros');

    if (currentIndex >= fields.length) {
        await doDownloadOutros(page, downloadPath, currentPrefix);
        return;
    }

    const fieldSelector = fields[currentIndex];

    const isAvailable = await page.evaluate((sel) => {
        const el = document.querySelector<HTMLSelectElement>(sel);
        return el && !el.disabled;
    }, fieldSelector);

    if (!isAvailable) {
        await processFieldOutros(page, fields, currentIndex + 1, currentPrefix, downloadPath);
        return;
    }

    const options = await page.evaluate((sel) => {
        const el = document.querySelector<HTMLSelectElement>(sel);
        return Array.from(el?.options || [])
            .map(o => o.value)
            .filter(v => v !== '' && v !== '99');
    }, fieldSelector);

    if (options.length === 0) {
        log.warn(`[${currentPrefix}] Campo (${fieldSelector}) sem opções válidas.`);
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
            await processFieldOutros(page, fields, currentIndex + 1, nextPrefix, downloadPath);
        });
    }
}

async function scrapeRelHistoricoPagamentoEsf(page: Page, downloadPath: string, targetUrl: string): Promise<void> {
    const log = logger.forMethod('scrapeRelHistoricoPagamentoEsf');
    const specificDownloadPath = path.join(downloadPath, 'historico-esf');

    await setupDownloadBehavior(page, specificDownloadPath);
    log.info(`Navegando para: ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'networkidle2' });

    const downloadLinks = await page.$$eval('.callout a[onclick*="mojarra.jsfcljs"]', (els) => {
        return els.map((a, idx) => ({
            index: idx,
            text: a.textContent?.trim().replace(/\s+/g, '_') || `arquivo_${idx}`
        }));
    });

    for (const item of downloadLinks) {
        await safeRunCombination(item.text, async () => {
            log.info(`Iniciando download do pacote: ${item.text}`);
            const savedPath = await triggerDownloadAndSave(page, {
                downloadPath: specificDownloadPath,
                fileName: item.text,
                trigger: async () => {
                    const links = await page.$$('.callout a[onclick*="mojarra.jsfcljs"]');
                    if (links[item.index]) {
                        await realClick(page, links[item.index]);
                    }
                },
                startTimeout: 30000,
                finishTimeout: 180000,
                retries: 2,
                retryDelayMs: 3000,
            });
            log.info(`Pacote baixado com sucesso: ${savedPath}`);
        });
    }
}

async function scrapeRelHistoricoPagamentoOutros(page: Page, downloadPath: string, targetUrl: string): Promise<void> {
    const log = logger.forMethod('scrapeRelHistoricoPagamentoOutros');
    const specificDownloadPath = path.join(downloadPath, 'historico-outros');

    await setupDownloadBehavior(page, specificDownloadPath);
    log.info(`Navegando para: ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'networkidle2' });

    await processFieldOutros(page, SELECTORS, 0, 'outros', specificDownloadPath);
}

export async function scrapeHistoricoPagamentoIndex(page: Page, moduleName: string, targetUrl: string): Promise<void> {
    const log = logger.forMethod('scrapeHistoricoPagamentoIndex');

    const urlObj = new URL(targetUrl);
    const treatedLinkName = urlObj.pathname.split('/').filter(Boolean).join('-').toLowerCase() || 'rel-historico-pagamento-index';
    const downloadPath = path.resolve(process.cwd(), 'downloads', moduleName, treatedLinkName);

    log.info(`Navegando para ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'networkidle2' });

    const reportLinks = await page.$$eval('.box-body a[href*="relHistoricoPagamento"]', (els) => {
        return els.map(a => (a as HTMLAnchorElement).href);
    });

    for (const link of reportLinks) {
        const subPage = await page.browser().newPage();
        try {
            if (link.includes('relHistoricoPagamentoEsf')) {
                await scrapeRelHistoricoPagamentoEsf(subPage, downloadPath, link);
            } else if (link.includes('relHistoricoPagamentoOutros')) {
                await scrapeRelHistoricoPagamentoOutros(subPage, downloadPath, link);
            }
        } catch (error) {
            log.error({ data: formatError(error) }, `Erro ao processar link ${link} no Histórico de Pagamentos:`);
        } finally {
            await subPage.close();
        }
    }

    log.info('Extração finalizada para: Histórico de Pagamentos.');
}