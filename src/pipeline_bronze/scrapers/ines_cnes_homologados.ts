// src/scrapers/ines_cnes_homologados.ts
import { Page } from "puppeteer";
import * as path from "path";
import { new_logger } from "../../services/logs.js";
import { getPrimeNgDropdownOptionsCount, selectPrimeNgDropdownOption } from "../primeng_helpers.js";
import {
    setupDownloadBehavior,
    triggerDownloadAndSave,
    realClick,
    formatError,
    safeDownloadJsonFromResponse,
    safeRunCombination
} from "../downloader.js";

const logger = new_logger(import.meta.url);

const SELECTORS = {
    uf: 'p-dropdown[formcontrolname="uf"]',
    municipio: 'p-dropdown[formcontrolname="municipio"]',
    btnDownload: 'button[aria-label="Download"]',
    btnVerTela: 'button[aria-label="Ver em tela"]'
};

async function doDownload(page: Page, downloadPath: string, filePrefix: string): Promise<void> {
    const log = logger.forMethod('doDownload');

    const isDownloadDisabled = await page.evaluate((sel) => {
        const el = document.querySelector<HTMLButtonElement>(sel);
        return !el || el.disabled || el.classList.contains('p-disabled');
    }, SELECTORS.btnDownload);

    if (isDownloadDisabled) {
        const isVerTelaDisabled = await page.evaluate((sel) => {
            const el = document.querySelector<HTMLButtonElement>(sel);
            return !el || el.disabled || el.classList.contains('p-disabled');
        }, SELECTORS.btnVerTela);

        if (isVerTelaDisabled) {
            log.warn(`[${filePrefix}] Ambos os botões (Download e Ver em tela) estão indisponíveis.`);
            return;
        }

        log.info(`[${filePrefix}] Botão de download bloqueado. Tentando via requisição (Ver em tela)...`);

        try {
            await safeDownloadJsonFromResponse(
                page,
                downloadPath,
                filePrefix,
                async () => {
                    await realClick(page, SELECTORS.btnVerTela);
                },
                '/gerenciaaps/ines-cnes-homologados',
                { retries: 2, retryDelayMs: 3000 }
            );
        } catch (error) {
            log.error({ data: formatError(error) }, `[${filePrefix}] Falha ao interceptar requisição JSON:`);
        }
    } else {
        log.info(`[${filePrefix}] Botão de download habilitado. Realizando download do arquivo...`);

        try {
            const savedPath = await triggerDownloadAndSave(page, {
                downloadPath,
                fileName: filePrefix,
                trigger: () => realClick(page, SELECTORS.btnDownload),
                startTimeout: 30000,
                finishTimeout: 180000,
                retries: 2,
                retryDelayMs: 3000,
            });
            log.info(`[${filePrefix}] Arquivo baixado e renomeado com sucesso: ${path.basename(savedPath)}`);
        } catch (error) {
            log.error({ data: formatError(error) }, `[${filePrefix}] Falha no download do arquivo:`);
        }
    }
}

export async function scrapeInesCnesHomologados(page: Page, moduleName: string, targetUrl: string): Promise<void> {
    const log = logger.forMethod('scrapeInesCnesHomologados');

    const urlObj = new URL(targetUrl);
    const treatedLinkName = urlObj.pathname.split('/').filter(Boolean).join('-').toLowerCase() || 'ines-cnes-homologados';
    const downloadPath = path.resolve(process.cwd(), 'downloads', moduleName, treatedLinkName);

    await setupDownloadBehavior(page, downloadPath);

    log.info(`Navegando para ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'networkidle2' });

    const numUfs = await getPrimeNgDropdownOptionsCount(page, SELECTORS.uf);

    for (let u = 0; u < numUfs; u++) {
        await safeRunCombination(`uf-${u}`, async () => {
            await selectPrimeNgDropdownOption(page, SELECTORS.uf, u);
            await new Promise(r => setTimeout(r, 1000));

            const numMunicipios = await getPrimeNgDropdownOptionsCount(page, SELECTORS.municipio);
            for (let m = 0; m < numMunicipios; m++) {
                await safeRunCombination(`uf-${u}_mun-${m}`, async () => {
                    await selectPrimeNgDropdownOption(page, SELECTORS.municipio, m);
                    await new Promise(r => setTimeout(r, 500));
                    await doDownload(page, downloadPath, `uf-${u}_mun-${m}`);
                });
            }
        });
    }

    log.info('Extração finalizada para: Equipes e estabelecimentos homologados.');
}