// src/scrapers/adesao_pse.ts
import { Page } from "puppeteer";
import * as path from "path";
import * as fs from "fs";
import { new_logger } from "../services/logs.js";
import { getPrimeNgDropdownOptionsCount, selectPrimeNgDropdownOption } from "../primeng_helpers.js";
import { setupDownloadBehavior, getFilesInDir, waitForNewDownloadAndRename } from "../downloader.js";

const logger = new_logger(import.meta.url);

const SELECTORS = {
    uf: 'p-dropdown[formcontrolname="estadoSelecionado"]',
    municipio: 'p-dropdown[formcontrolname="municipioSelecionado"]',
    ciclo: 'p-dropdown[formcontrolname="cicloSelecionado"]',
    tipoLocalizacao: 'p-dropdown[formcontrolname="tipoLocalizacaoSelecionado"]',
    localizacaoDiferenciada: 'p-dropdown[formcontrolname="localizacaoDiferenciadaSelecionada"]',
    escola: 'p-dropdown[formcontrolname="escolaSelecionada"]',
    btnDownload: 'button[aria-label="Download"]',
    btnVerTela: 'button[aria-label="Ver em tela"]'
};

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
            response => response.url().includes('/adesao/pse') && response.request().method() === 'GET',
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

async function processEscola(page: Page, downloadPath: string, prefix: string): Promise<void> {
    if (await isDropdownActive(page, SELECTORS.escola)) {
        await new Promise(r => setTimeout(r, 2000));
        const numEscolas = await getPrimeNgDropdownOptionsCount(page, SELECTORS.escola);
        for (let e = 0; e < numEscolas; e++) {
            await selectPrimeNgDropdownOption(page, SELECTORS.escola, e);
            await new Promise(r => setTimeout(r, 1000));
            await doDownload(page, downloadPath, `${prefix}_esc-${e}`);
        }
    } else {
        await doDownload(page, downloadPath, prefix);
    }
}

async function processLocalizacaoDiferenciada(page: Page, downloadPath: string, prefix: string): Promise<void> {
    if (await isDropdownActive(page, SELECTORS.localizacaoDiferenciada)) {
        const numLocDif = await getPrimeNgDropdownOptionsCount(page, SELECTORS.localizacaoDiferenciada);
        for (let ld = 0; ld < numLocDif; ld++) {
            await selectPrimeNgDropdownOption(page, SELECTORS.localizacaoDiferenciada, ld);
            await new Promise(r => setTimeout(r, 1000));
            await processEscola(page, downloadPath, `${prefix}_locDif-${ld}`);
        }
    } else {
        await processEscola(page, downloadPath, prefix);
    }
}

async function processTipoLocalizacao(page: Page, downloadPath: string, prefix: string): Promise<void> {
    if (await isDropdownActive(page, SELECTORS.tipoLocalizacao)) {
        const numTipoLoc = await getPrimeNgDropdownOptionsCount(page, SELECTORS.tipoLocalizacao);
        for (let tl = 0; tl < numTipoLoc; tl++) {
            await selectPrimeNgDropdownOption(page, SELECTORS.tipoLocalizacao, tl);
            await new Promise(r => setTimeout(r, 1000));
            await processLocalizacaoDiferenciada(page, downloadPath, `${prefix}_tipoLoc-${tl}`);
        }
    } else {
        await processLocalizacaoDiferenciada(page, downloadPath, prefix);
    }
}

async function processCiclo(page: Page, downloadPath: string, prefix: string): Promise<void> {
    if (await isDropdownActive(page, SELECTORS.ciclo)) {
        const numCiclos = await getPrimeNgDropdownOptionsCount(page, SELECTORS.ciclo);
        for (let c = 0; c < numCiclos; c++) {
            await selectPrimeNgDropdownOption(page, SELECTORS.ciclo, c);
            await new Promise(r => setTimeout(r, 2000));
            await processTipoLocalizacao(page, downloadPath, `${prefix}_ciclo-${c}`);
        }
    } else {
        await processTipoLocalizacao(page, downloadPath, prefix);
    }
}

export async function scrapeAdesaoPse(page: Page, moduleName: string, targetUrl: string): Promise<void> {
    const log = logger.forMethod('scrapeAdesaoPse');

    const urlObj = new URL(targetUrl);
    const treatedLinkName = urlObj.pathname.split('/').filter(Boolean).join('-').toLowerCase() || 'adesao-pse';
    const downloadPath = path.resolve(process.cwd(), 'downloads', moduleName, treatedLinkName);

    await setupDownloadBehavior(page, downloadPath);

    log.info(`Navegando para ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'networkidle2' });

    const numUfs = await getPrimeNgDropdownOptionsCount(page, SELECTORS.uf);

    for (let u = 0; u < numUfs; u++) {
        await selectPrimeNgDropdownOption(page, SELECTORS.uf, u);
        await new Promise(r => setTimeout(r, 1000));

        if (await isDropdownActive(page, SELECTORS.municipio)) {
            const numMunicipios = await getPrimeNgDropdownOptionsCount(page, SELECTORS.municipio);
            for (let m = 0; m < numMunicipios; m++) {
                await selectPrimeNgDropdownOption(page, SELECTORS.municipio, m);
                await new Promise(r => setTimeout(r, 1500));
                await processCiclo(page, downloadPath, `uf-${u}_mun-${m}`);
            }
        } else {
            await processCiclo(page, downloadPath, `uf-${u}`);
        }
    }

    log.info('Extração finalizada para: Adesão PSE.');
}