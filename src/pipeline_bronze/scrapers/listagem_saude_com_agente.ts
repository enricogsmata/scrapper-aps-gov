// src/scrapers/listagem_saude_com_agente.ts
import { Page } from "puppeteer";
import * as path from "path";
import { new_logger } from "../../services/logs.js";
import {
    setupDownloadBehavior,
    triggerDownloadAndSave,
    realClick,
    formatError
} from "../downloader.js";

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
    log.info('Iniciando download da listagem de homologação...');

    try {
        const savedPath = await triggerDownloadAndSave(page, {
            downloadPath,
            fileName: 'homologacao_saude_com_agente',
            trigger: () => realClick(page, LINK_SELECTOR),
            startTimeout: 30000,
            finishTimeout: 180000,
            retries: 2,
            retryDelayMs: 3000,
            skipIfExists: true
        });
        log.info(`Download da listagem concluído com sucesso: ${savedPath}`);
    } catch (error) {
        log.error({ data: formatError(error) }, 'Falha no download da listagem:');
    }

    log.info('Extração finalizada para: Lista de homologação dos aprovados Saúde com Agente.');
}