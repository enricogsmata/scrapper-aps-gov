// src/scrapers/cobertura_saude_bucal_historico.ts
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
    btnDownload: 'button[aria-label="Download"]',
    btnVerTela: 'button[aria-label="Ver em tela"]'
};

const GEOGRAPHIC_DROPDOWNS = [
    { key: 'regiao', selector: SELECTORS.regiao },
    { key: 'estado', selector: SELECTORS.estado },
    { key: 'municipio', selector: SELECTORS.municipio }
];

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
                '/cobertura/saude-bucal',
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

export async function scrapeCoberturaSaudeBucalHistorico(page: Page, downloadPath: string, targetUrl: string): Promise<void> {
    const log = logger.forMethod('scrapeCoberturaSaudeBucalHistorico');

    const urlObj = new URL(targetUrl);
    const subfolder = urlObj.pathname.split('/').pop() || 'historico';
    const specificDownloadPath = path.join(downloadPath, subfolder);

    await setupDownloadBehavior(page, specificDownloadPath);

    log.info(`Navegando para histórico de saúde bucal: ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'networkidle2' });

    for (const consulta of CONSULTA_RADIOS) {
        log.info(`[${subfolder}] Selecionando opção de consulta: ${consulta.label}`);
        await page.click(`label[for="${consulta.id}"]`);
        await new Promise(r => setTimeout(r, 1000));

        for (const unidade of UNIDADE_RADIOS) {
            log.info(`[${subfolder}] Selecionando unidade geográfica: ${unidade.label}`);
            await page.click(`label[for="${unidade.id}"]`);
            await new Promise(r => setTimeout(r, 1000));

            await iterateGeographicDropdowns(
                page,
                GEOGRAPHIC_DROPDOWNS,
                0,
                specificDownloadPath,
                `${subfolder}_consulta-${consulta.label}_unidade-${unidade.label}`
            );
        }
    }

    log.info(`Extração finalizada para histórico de saúde bucal: ${subfolder}`);
}