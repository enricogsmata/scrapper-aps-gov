// src/scrapers/cobertura_saude_bucal_historico.ts
import { Page } from "puppeteer";
import * as path from "path";
import * as fs from "fs";
import { new_logger } from "../services/logs.js";
import { getPrimeNgDropdownOptionsCount, selectPrimeNgDropdownOption } from "../primeng_helpers.js";
import { setupDownloadBehavior, getFilesInDir, waitForNewDownloadAndRename } from "../downloader.js";

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

async function isDropdownActive(page: Page, selector: string): Promise<boolean> {
    return page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return false;
        const dropdown = el.querySelector('.p-dropdown');
        if (!dropdown) return false;
        return !dropdown.classList.contains('p-disabled') && (dropdown as HTMLElement).offsetParent !== null;
    }, selector);
}

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

        const responsePromise = page.waitForResponse(
            response => response.url().includes('/cobertura/saude-bucal') && response.request().method() === 'GET',
            { timeout: 60000 }
        );

        await page.click(SELECTORS.btnVerTela);

        try {
            const response = await responsePromise;
            const json = await response.json();

            const filePath = path.join(downloadPath, `${filePrefix}.json`);
            fs.writeFileSync(filePath, JSON.stringify(json, null, 2));
            log.info(`[${filePrefix}] Dados salvos em JSON com sucesso.`);
        } catch (error) {
            log.error({ data: JSON.stringify(error, null, 4) }, `[${filePrefix}] Falha ao interceptar requisição JSON:`);
        }
    } else {
        log.info(`[${filePrefix}] Botão de download habilitado. Realizando download do arquivo...`);
        const filesBefore = getFilesInDir(downloadPath);
        await page.click(SELECTORS.btnDownload);
        try {
            await waitForNewDownloadAndRename(downloadPath, filesBefore, filePrefix);
            log.info(`[${filePrefix}] Arquivo baixado e renomeado com sucesso.`);
        } catch (error) {
            log.error({ data: JSON.stringify(error, null, 4) }, `[${filePrefix}] Falha no download do arquivo:`);
        }
    }
}

async function processCompetencias(page: Page, downloadPath: string, prefix: string): Promise<void> {
    if (await isDropdownActive(page, SELECTORS.compInicio)) {
        const numInicio = await getPrimeNgDropdownOptionsCount(page, SELECTORS.compInicio);
        for (let i = 0; i < numInicio; i++) {
            await selectPrimeNgDropdownOption(page, SELECTORS.compInicio, i);
            await new Promise(r => setTimeout(r, 1000));

            if (await isDropdownActive(page, SELECTORS.compFim)) {
                const numFim = await getPrimeNgDropdownOptionsCount(page, SELECTORS.compFim);
                for (let f = 0; f < numFim; f++) {
                    await selectPrimeNgDropdownOption(page, SELECTORS.compFim, f);
                    await new Promise(r => setTimeout(r, 500));
                    await doDownload(page, downloadPath, `${prefix}_compIni-${i}_compFim-${f}`);
                }
            } else {
                await doDownload(page, downloadPath, `${prefix}_compIni-${i}`);
            }
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
            await selectPrimeNgDropdownOption(page, currentDropdown.selector, i);
            await new Promise(r => setTimeout(r, 1000));
            const nextPrefix = `${currentPrefix}_${currentDropdown.key}-${i}`;
            await iterateGeographicDropdowns(page, dropdowns, currentIndex + 1, downloadPath, nextPrefix);
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