// src/scrapers/tria.ts
import { Page } from "puppeteer";
import * as path from "path";
import * as fs from "fs";
import { new_logger } from "../services/logs.js";
import { setupDownloadBehavior, getFilesInDir, waitForNewDownloadAndRename } from "../downloader.js";

const logger = new_logger(import.meta.url);

function sanitizeFileName(name: string): string {
    return name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .replace(/_+/g, '_')
        .toLowerCase();
}

export async function scrapeTria(page: Page, moduleName: string, targetUrl: string): Promise<void> {
    const log = logger.forMethod('scrapeTria');

    const urlObj = new URL(targetUrl);
    const treatedLinkName = urlObj.pathname.split('/').filter(Boolean).join('-').toLowerCase() || 'tria';
    const baseDownloadPath = path.resolve(process.cwd(), 'downloads', moduleName, treatedLinkName);
    const documentosDownloadPath = path.join(baseDownloadPath, 'documentos');

    await setupDownloadBehavior(page, baseDownloadPath);

    log.info(`Navegando para ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'networkidle2' });

    await page.waitForSelector('app-relatorio-tria-temporario', { visible: true });

    const zipLinks = await page.$$eval('a.link[href*="egestorab.saude.gov.br/image/?file="]', (els) => {
        return els.map((a) => ({
            url: (a as HTMLAnchorElement).href,
            text: a.textContent?.trim() || ''
        }));
    });

    log.info(`Encontrados ${zipLinks.length} arquivos para download no Panorama Geral e UFs.`);

    for (const [index, item] of zipLinks.entries()) {
        const rawName = item.text || `arquivo_${index + 1}`;
        const cleanName = sanitizeFileName(rawName.split('(')[0]?.trim() || rawName);
        const filesBefore = getFilesInDir(baseDownloadPath);

        log.info(`[${cleanName}] Baixando arquivo TRIA...`);

        try {
            await page.evaluate((url) => {
                const a = document.createElement('a');
                a.href = url;
                a.download = '';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            }, item.url);

            await waitForNewDownloadAndRename(baseDownloadPath, filesBefore, cleanName, 120000);
            log.info(`[${cleanName}] Arquivo baixado com sucesso.`);
        } catch (error) {
            log.error({ data: JSON.stringify(error, null, 4) }, `[${cleanName}] Falha no download do arquivo:`);
        }
    }

    if (!fs.existsSync(documentosDownloadPath)) {
        fs.mkdirSync(documentosDownloadPath, { recursive: true });
    }

    const materialLinks = await page.$$eval('ul li a.font-bold', (els) => {
        return els.map((a) => ({
            url: (a as HTMLAnchorElement).href,
            text: a.textContent?.trim() || ''
        }));
    });

    for (const item of materialLinks) {
        if (!item.url.endsWith('.pdf')) {
            continue;
        }

        if (
            item.url.includes('faq-tria') ||
            item.text.toLowerCase().includes('resultado da tria') ||
            item.text.toLowerCase().includes('perguntas frequentes')
        ) {
            continue;
        }

        const fileName = path.basename(new URL(item.url).pathname) || `${sanitizeFileName(item.text)}.pdf`;
        const filePath = path.join(documentosDownloadPath, fileName);

        log.info(`Baixando material de apoio: ${fileName}`);

        try {
            const response = await fetch(item.url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status} - ${response.statusText}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            fs.writeFileSync(filePath, Buffer.from(arrayBuffer));
            log.info(`Material de apoio salvo com sucesso: ${fileName}`);
        } catch (error) {
            log.error({ data: JSON.stringify(error, null, 4) }, `Falha ao baixar material de apoio (${item.url}):`);
        }
    }

    log.info('Extração finalizada para: Triagem para Risco de Insegurança Alimentar (TRIA).');
}