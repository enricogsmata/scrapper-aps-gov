// src/scrapers/adesao_pse.ts
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

const SELECTORS = {
    uf: 'p-dropdown[formcontrolname="estadoSelecionado"]',
    municipio: 'p-dropdown[formcontrolname="municipioSelecionado"]',
    ciclo: 'p-dropdown[formcontrolname="cicloSelecionado"]',
    tipoLocalizacao: 'p-dropdown[formcontrolname="tipoLocalizacaoSelecionado"]',
    localizacaoDiferenciada: 'p-dropdown[formcontrolname="localizacaoDiferenciadaSelecionada"]',
    escola: 'p-dropdown[formcontrolname="escolaSelecionada"]',
    btnDownload: 'app-botao-download-excel button, button[aria-label="Download"]',
    btnVerTela: 'app-botao[arialabel="Ver em tela"] button, button[aria-label="Ver em tela"]'
};

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
                '/adesao/pse',
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

async function processEscola(page: Page, downloadPath: string, prefix: string): Promise<void> {
    if (await isDropdownActive(page, SELECTORS.escola)) {
        await new Promise(r => setTimeout(r, 1500));
        const numEscolas = await getPrimeNgDropdownOptionsCount(page, SELECTORS.escola);
        if (numEscolas > 0) {
            for (let e = 0; e < numEscolas; e++) {
                await safeRunCombination(`${prefix}_esc-${e}`, async () => {
                    await selectPrimeNgDropdownOption(page, SELECTORS.escola, e);
                    await new Promise(r => setTimeout(r, 1000));
                    await doDownload(page, downloadPath, `${prefix}_esc-${e}`);
                });
            }
            return;
        }
    }
    await doDownload(page, downloadPath, prefix);
}

async function processLocalizacaoDiferenciada(page: Page, downloadPath: string, prefix: string): Promise<void> {
    if (await isDropdownActive(page, SELECTORS.localizacaoDiferenciada)) {
        const numLocDif = await getPrimeNgDropdownOptionsCount(page, SELECTORS.localizacaoDiferenciada);
        if (numLocDif > 0) {
            for (let ld = 0; ld < numLocDif; ld++) {
                await safeRunCombination(`${prefix}_locDif-${ld}`, async () => {
                    await selectPrimeNgDropdownOption(page, SELECTORS.localizacaoDiferenciada, ld);
                    await new Promise(r => setTimeout(r, 1000));
                    await processEscola(page, downloadPath, `${prefix}_locDif-${ld}`);
                });
            }
            return;
        }
    }
    await processEscola(page, downloadPath, prefix);
}

async function processTipoLocalizacao(page: Page, downloadPath: string, prefix: string): Promise<void> {
    if (await isDropdownActive(page, SELECTORS.tipoLocalizacao)) {
        const numTipoLoc = await getPrimeNgDropdownOptionsCount(page, SELECTORS.tipoLocalizacao);
        if (numTipoLoc > 0) {
            for (let tl = 0; tl < numTipoLoc; tl++) {
                await safeRunCombination(`${prefix}_tipoLoc-${tl}`, async () => {
                    await selectPrimeNgDropdownOption(page, SELECTORS.tipoLocalizacao, tl);
                    await new Promise(r => setTimeout(r, 1000));
                    await processLocalizacaoDiferenciada(page, downloadPath, `${prefix}_tipoLoc-${tl}`);
                });
            }
            return;
        }
    }
    await processLocalizacaoDiferenciada(page, downloadPath, prefix);
}

async function processCiclo(page: Page, downloadPath: string, prefix: string): Promise<void> {
    if (await isDropdownActive(page, SELECTORS.ciclo)) {
        const numCiclos = await getPrimeNgDropdownOptionsCount(page, SELECTORS.ciclo);
        if (numCiclos > 0) {
            for (let c = 0; c < numCiclos; c++) {
                await safeRunCombination(`${prefix}_ciclo-${c}`, async () => {
                    await selectPrimeNgDropdownOption(page, SELECTORS.ciclo, c);
                    await new Promise(r => setTimeout(r, 1500));
                    await processTipoLocalizacao(page, downloadPath, `${prefix}_ciclo-${c}`);
                });
            }
            return;
        }
    }
    await processTipoLocalizacao(page, downloadPath, prefix);
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
        await safeRunCombination(`uf-${u}`, async () => {
            await selectPrimeNgDropdownOption(page, SELECTORS.uf, u);
            await new Promise(r => setTimeout(r, 1000));

            if (await isDropdownActive(page, SELECTORS.municipio)) {
                const numMunicipios = await getPrimeNgDropdownOptionsCount(page, SELECTORS.municipio);
                if (numMunicipios > 0) {
                    for (let m = 0; m < numMunicipios; m++) {
                        await safeRunCombination(`uf-${u}_mun-${m}`, async () => {
                            await selectPrimeNgDropdownOption(page, SELECTORS.municipio, m);
                            await new Promise(r => setTimeout(r, 1500));
                            await processCiclo(page, downloadPath, `uf-${u}_mun-${m}`);
                        });
                    }
                    return;
                }
            }
            await processCiclo(page, downloadPath, `uf-${u}`);
        });
    }

    log.info('Extração finalizada para: Adesão PSE.');
}