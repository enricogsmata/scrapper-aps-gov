// src/scrapers/sisab_documentos.ts
import { Page } from "puppeteer";
import * as path from "path";
import * as fs from "fs";
import { new_logger } from "../services/logs.js";
import { safeDownloadFromUrl, safeRunCombination } from "../downloader.js";

const logger = new_logger(import.meta.url);

export async function scrapeSisabDocumentos(page: Page, downloadPath: string, targetUrl: string): Promise<void> {
    const log = logger.forMethod('scrapeSisabDocumentos');
    const specificDownloadPath = path.join(downloadPath, 'documentos');

    if (!fs.existsSync(specificDownloadPath)) {
        fs.mkdirSync(specificDownloadPath, { recursive: true });
    }

    log.info(`Navegando para documentos SISAB: ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'networkidle2' });

    const pdfLinks = await page.$$eval('.box-body a[href*=".pdf"]', (els) => {
        return Array.from(new Set(els.map(a => (a as HTMLAnchorElement).href)));
    });

    log.info(`Encontrados ${pdfLinks.length} documentos PDF para download.`);

    for (const url of pdfLinks) {
        const urlObj = new URL(url);
        const fileName = path.basename(decodeURIComponent(urlObj.pathname)) || `doc_${Date.now()}.pdf`;
        const filePath = path.join(specificDownloadPath, fileName);

        await safeRunCombination(fileName, async () => {
            log.info(`Baixando documento: ${fileName}`);
            await safeDownloadFromUrl(url, filePath, {
                retries: 2,
                retryDelayMs: 3000,
                skipIfExists: true
            });
            log.info(`Documento salvo com sucesso: ${fileName}`);
        });
    }

    log.info('Extração finalizada para: Documentos SISAB.');
}