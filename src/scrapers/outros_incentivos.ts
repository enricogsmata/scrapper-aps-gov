// src/scrapers/outros_incentivos.ts
import { Page } from "puppeteer";
import * as path from "path";
import { new_logger } from "../services/logs.js";
import {
    setupDownloadBehavior,
    triggerDownloadAndSave,
    safeDownloadFromUrl,
    formatError,
    safeRunCombination
} from "../downloader.js";

const logger = new_logger(import.meta.url);

function sanitizeFileName(name: string): string {
    return name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .replace(/_+/g, '_')
        .toLowerCase();
}

export async function scrapeOutrosIncentivos(page: Page, moduleName: string, targetUrl: string): Promise<void> {
    const log = logger.forMethod('scrapeOutrosIncentivos');

    const urlObj = new URL(targetUrl);
    const treatedLinkName = urlObj.pathname.split('/').filter(Boolean).join('-').toLowerCase() || 'outros-incentivos';
    const downloadPath = path.resolve(process.cwd(), 'downloads', moduleName, treatedLinkName);

    await setupDownloadBehavior(page, downloadPath);

    log.info(`Navegando para ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'networkidle2' });

    await page.waitForSelector('p-accordiontab', { visible: true });

    const items = await page.$$eval('p-accordiontab', (tabs) => {
        return tabs.map((tab) => {
            const headerText = tab.querySelector('.p-accordion-header-text')?.textContent?.trim() || '';
            const downloadLink = tab.querySelector('.p-accordion-content a.br-button')?.getAttribute('href') || '';
            return {
                title: headerText,
                url: downloadLink
            };
        });
    });

    log.info(`Encontradas ${items.length} portarias no relatório.`);

    for (const [index, item] of items.entries()) {
        const title = item.title || `portaria_${index + 1}`;
        const cleanName = sanitizeFileName(title);

        if (!item.url) {
            log.warn(`[${title}] Link de download não encontrado.`);
            continue;
        }

        await safeRunCombination(cleanName, async () => {
            log.info(`[${cleanName}] Iniciando download do incentivo...`);

            if (item.url.startsWith('http')) {
                // Download direto via fetch seguro
                const ext = path.extname(new URL(item.url).pathname) || '.xlsx';
                const dest = path.join(downloadPath, `${cleanName}${ext}`);
                await safeDownloadFromUrl(item.url, dest, { retries: 2, retryDelayMs: 3000, skipIfExists: true });
            } else {
                // Disparo no navegador
                await triggerDownloadAndSave(page, {
                    downloadPath,
                    fileName: cleanName,
                    trigger: async () => {
                        await page.evaluate((url) => {
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = '';
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                        }, item.url);
                    },
                    startTimeout: 30000,
                    finishTimeout: 120000,
                    retries: 2,
                    retryDelayMs: 3000,
                    skipIfExists: true
                });
            }
            log.info(`[${cleanName}] Arquivo baixado com sucesso.`);
        });
    }

    log.info('Extração finalizada para: Outros Incentivos.');
}