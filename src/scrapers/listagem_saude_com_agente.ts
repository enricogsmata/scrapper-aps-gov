// src/scrapers/listagem_saude_com_agente.ts
import { Page } from "puppeteer";
import * as path from "path";
import { new_logger } from "../services/logs.js";
import { setupDownloadBehavior, getFilesInDir, waitForNewDownloadAndRename } from "../downloader.js";

const logger = new_logger(import.meta.url);

const LINK_SELECTOR = 'app-listagem-saude-com-agente a.cursor-pointer';

export async function scrapeListagemSaudeComAgente(page: Page, moduleName: string, targetUrl: string): Promise<void> {
    const log = logger.forMethod('scrapeListagemSaudeComAgente');

    const urlObj = new URL(targetUrl);
    const treatedLinkName = urlObj.pathname.split('/').filter(Boolean).join('-').toLowerCase() || 'listagem-saude-com-agente';
    const downloadPath = path.resolve(process.cwd(), 'downloads', moduleName, treatedLinkName);

    await setupDownloadBehavior(page, downloadPath);

    log.info(`Navegando para ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'networkidle2' });

    await page.waitForSelector(LINK_SELECTOR, { visible: true });

    const filesBefore = getFilesInDir(downloadPath);
    log.info('Iniciando download da listagem de homologação...');

    await page.click(LINK_SELECTOR);

    try {
        await waitForNewDownloadAndRename(downloadPath, filesBefore, 'homologacao_saude_com_agente', 120000);
        log.info('Download da listagem concluído com sucesso.');
    } catch (error) {
        log.error({ data: JSON.stringify(error, null, 4) }, 'Falha no download da listagem:');
    }

    log.info('Extração finalizada para: Lista de homologação dos aprovados Saúde com Agente.');
}