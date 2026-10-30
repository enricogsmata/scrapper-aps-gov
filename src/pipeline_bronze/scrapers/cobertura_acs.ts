// src/scrapers/cobertura_acs.ts
import { Page } from "puppeteer";
import * as path from "path";
import { new_logger } from "../../services/logs.js";
import { getPrimeNgDropdownOptionsCount, selectPrimeNgDropdownOption, isDropdownActive } from "../primeng_helpers.js";
import {
    setupDownloadBehavior,
    triggerDownloadAndSave,
    realClick,
    formatError,
    safeDownloadJsonFromResponse,
    safeRunCombination
} from "../downloader.js";

const logger = new_logger(import.meta.url);

const CONSULTA_RADIOS = [
    { id: 'periodo', label: 'periodoPorUnidade' },
    { id: 'unidades', label: 'unidadePorPeriodo' }
];

const UNIDADE_RADIOS = [
    { id: 'brasil', label: 'brasil' },
    { id: 'macrorregiao', label: 'regiao' },
    { id: 'uf', label: 'uf' },
    { id: 'municipio', label: 'municipio' }
];

const SELECTORS = {
    regiao: 'p-dropdown[name="regiao"]',
    estado: 'p-dropdown[name="estado"]',
    municipio: 'p-dropdown[name="municipio"]',
    compInicio: 'p-dropdown[name="compInicio"]',
    compFim: 'p-dropdown[name="compFim"]',
    btnDownload: 'app-botao-download-excel button, button[aria-label="Download"]',
    btnVerTela: 'app-botao[arialabel="Ver em tela"] button, button[aria-label="Ver em tela"]'
};

const GEOGRAPHIC_DROPDOWNS = [
    { key: 'regiao', selector: SELECTORS.regiao },
    { key: 'estado', selector: SELECTORS.estado },
    { key: 'municipio', selector: SELECTORS.municipio }
];

async function doDownload(page: Page, downloadPath: string, filePrefix: string): Promise<void> {
    const log = logger.forMethod('doDownload');

    const isVerTelaDisabled = await page.evaluate((sel) => {
        const el = document.querySelector<HTMLButtonElement>(sel);
        return !el || el.disabled || el.classList.contains('p-disabled') || el.hasAttribute('disabled');
    }, SELECTORS.btnVerTela);

    if (!isVerTelaDisabled) {
        log.info(`[${filePrefix}] Botão "Ver em tela" habilitado. Capturando requisição JSON...`);
        try {
            await safeDownloadJsonFromResponse(
                page,
                downloadPath,
                filePrefix,
                async () => {
                    await realClick(page, SELECTORS.btnVerTela);
                },
                '/cobertura/acs',
                { retries: 2, retryDelayMs: 3000 }
            );
            return;
        } catch (error) {
            log.warn({ data: formatError(error) }, `[${filePrefix}] Falha ao obter JSON via "Ver em tela". Tentando fallback para download físico...`);
        }
    }

    const isDownloadDisabled = await page.evaluate((sel) => {
        const el = document.querySelector<HTMLButtonElement>(sel);
        return !el || el.disabled || el.classList.contains('p-disabled') || el.hasAttribute('disabled');
    }, SELECTORS.btnDownload);

    if (isDownloadDisabled) {
        log.warn(`[${filePrefix}] Ambos os botões (Ver em tela e Download) estão indisponíveis.`);
        return;
    }

    log.info(`[${filePrefix}] Botão de download habilitado. Realizando download do arquivo...`);
    try {
        const savedPath = await triggerDownloadAndSave(page, {
            downloadPath,
            fileName: filePrefix,
            trigger: () => realClick(page, SELECTORS.btnDownload),
            startTimeout: 60000,
            finishTimeout: 300000,
            retries: 3,
            retryDelayMs: 5000,
        });
        log.info(`[${filePrefix}] Arquivo baixado e renomeado com sucesso: ${path.basename(savedPath)}`);
    } catch (error) {
        log.error({ data: formatError(error) }, `[${filePrefix}] Falha no download do arquivo:`);
    }
}

async function processCompetencias(page: Page, downloadPath: string, prefix: string): Promise<void> {
    if (await isDropdownActive(page, SELECTORS.compInicio)) {
        const numInicio = await getPrimeNgDropdownOptionsCount(page, SELECTORS.compInicio);
        for (let i = 0; i < numInicio; i++) {
            await safeRunCombination(`${prefix}_compIni-${i}`, async () => {
                await selectPrimeNgDropdownOption(page, SELECTORS.compInicio, i);
                await new Promise(r => setTimeout(r, 1000));

                if (await isDropdownActive(page, SELECTORS.compFim)) {
                    const numFim = await getPrimeNgDropdownOptionsCount(page, SELECTORS.compFim);
                    for (let f = 0; f < numFim; f++) {
                        await safeRunCombination(`${prefix}_compIni-${i}_compFim-${f}`, async () => {
                            await selectPrimeNgDropdownOption(page, SELECTORS.compFim, f);
                            await new Promise(r => setTimeout(r, 500));
                            await doDownload(page, downloadPath, `${prefix}_compIni-${i}_compFim-${f}`);
                        });
                    }
                } else {
                    await doDownload(page, downloadPath, `${prefix}_compIni-${i}`);
                }
            });
        }
    } else {
        await doDownload(page, downloadPath, prefix);
    }
}

async function iterateGeographicDropdowns(
    page: Page,
    dropdowns: typeof GEOGRAPHIC_DROPDOWNS,
    currentIndex: number,
    downloadPath: string,
    currentPrefix: string
): Promise<void> {
    if (currentIndex >= dropdowns.length) {
        await processCompetencias(page, downloadPath, currentPrefix);
        return;
    }

    const currentDropdown = dropdowns[currentIndex];

    if (await isDropdownActive(page, currentDropdown.selector)) {
        const count = await getPrimeNgDropdownOptionsCount(page, currentDropdown.selector);
        for (let i = 0; i < count; i++) {
            const nextPrefix = `${currentPrefix}_${currentDropdown.key}-${i}`;
            await safeRunCombination(nextPrefix, async () => {
                await selectPrimeNgDropdownOption(page, currentDropdown.selector, i);
                await new Promise(r => setTimeout(r, 1000));
                await iterateGeographicDropdowns(page, dropdowns, currentIndex + 1, downloadPath, nextPrefix);
            });
        }
    } else {
        await iterateGeographicDropdowns(page, dropdowns, currentIndex + 1, downloadPath, currentPrefix);
    }
}

export async function scrapeCoberturaAcs(page: Page, moduleName: string, targetUrl: string): Promise<void> {
    const log = logger.forMethod('scrapeCoberturaAcs');

    const urlObj = new URL(targetUrl);
    const treatedLinkName = urlObj.pathname.split('/').filter(Boolean).join('-').toLowerCase() || 'cobertura-acs';
    const downloadPath = path.resolve(process.cwd(), 'downloads', moduleName, treatedLinkName);

    await setupDownloadBehavior(page, downloadPath);

    log.info(`Navegando para ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'networkidle2' });

    for (const consulta of CONSULTA_RADIOS) {
        log.info(`Selecionando opção de consulta: ${consulta.label}`);
        await page.click(`label[for="${consulta.id}"]`);
        await new Promise(r => setTimeout(r, 1000));

        for (const unidade of UNIDADE_RADIOS) {
            log.info(`Selecionando unidade geográfica: ${unidade.label}`);
            await page.click(`label[for="${unidade.id}"]`);
            await new Promise(r => setTimeout(r, 1000));

            await iterateGeographicDropdowns(
                page,
                GEOGRAPHIC_DROPDOWNS,
                0,
                downloadPath,
                `consulta-${consulta.label}_unidade-${unidade.label}`
            );
        }
    }

    log.info('Extração finalizada para: Cobertura ACS.');
}