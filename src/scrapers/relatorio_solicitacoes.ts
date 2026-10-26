// src/scrapers/relatorio_solicitacoes.ts
import { Page } from "puppeteer";
import * as path from "path";
import { new_logger } from "../services/logs.js";
import { getPrimeNgDropdownOptionsCount, selectPrimeNgDropdownOption, selectPrimeNgRadioButton } from "../primeng_helpers.js";
import { setupDownloadBehavior, getFilesInDir, waitForNewDownloadAndRename } from "../downloader.js";

const logger = new_logger(import.meta.url);

const RADIO_OPTIONS = [
    { id: 'porEstrategia', prefix: 'estrategia' },
    { id: 'porSolicitacao', prefix: 'solicitacao' },
    { id: 'consolidadoComponentesExtras', prefix: 'componentesExtras' }
];

const SELECTORS = {
    uf: 'p-dropdown#uf',
    municipio: 'p-dropdown#municipio',
    tipoSolicitacao: 'p-dropdown#tipoSolicitacao',
    estrategia: 'p-dropdown#estrategia',
    btnDownloadModal: 'div.buttons-container button.br-button.secondary',
    btnAplicarFiltro: 'div.buttons-container button.br-button.primary',
    btnDownloadTabela: 'app-table-relatorio-solicitacoes button.border-none',
    tabelaRelatorio: 'app-table-relatorio-solicitacoes table.p-datatable-table'
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

    const isModalDownloadDisabled = await page.evaluate((sel) => {
        const el = document.querySelector<HTMLButtonElement>(sel);
        return !el || el.disabled || el.classList.contains('p-disabled');
    }, SELECTORS.btnDownloadModal);

    const filesBefore = getFilesInDir(downloadPath);

    if (!isModalDownloadDisabled) {
        log.info(`[${filePrefix}] Download direto habilitado no modal.`);
        await page.click(SELECTORS.btnDownloadModal);
    } else {
        log.info(`[${filePrefix}] Download bloqueado no modal. Aplicando filtro para download da tabela...`);
        await page.click(SELECTORS.btnAplicarFiltro);
        await page.waitForSelector(SELECTORS.tabelaRelatorio, { visible: true, timeout: 60000 });
        await page.waitForSelector(SELECTORS.btnDownloadTabela, { visible: true, timeout: 60000 });
        await page.click(SELECTORS.btnDownloadTabela);
    }

    try {
        await waitForNewDownloadAndRename(downloadPath, filesBefore, filePrefix, 120000);
        log.info(`[${filePrefix}] Download realizado e renomeado com sucesso.`);
    } catch (error) {
        log.error({ data: JSON.stringify(error, null, 4) }, `[${filePrefix}] Falha no download:`);
    }
}

async function iterateTiposEEstrategias(page: Page, downloadPath: string, basePrefix: string): Promise<void> {
    if (await isDropdownActive(page, SELECTORS.tipoSolicitacao)) {
        const numTipos = await getPrimeNgDropdownOptionsCount(page, SELECTORS.tipoSolicitacao);
        for (let t = 0; t < numTipos; t++) {
            await selectPrimeNgDropdownOption(page, SELECTORS.tipoSolicitacao, t);
            await new Promise(r => setTimeout(r, 1000));

            if (await isDropdownActive(page, SELECTORS.estrategia)) {
                const numEst = await getPrimeNgDropdownOptionsCount(page, SELECTORS.estrategia);
                for (let e = 0; e < numEst; e++) {
                    await selectPrimeNgDropdownOption(page, SELECTORS.estrategia, e);
                    await new Promise(r => setTimeout(r, 1000));
                    await doDownload(page, downloadPath, `${basePrefix}_tipoSol-${t}_est-${e}`);
                }
            } else {
                await doDownload(page, downloadPath, `${basePrefix}_tipoSol-${t}`);
            }
        }
    } else if (await isDropdownActive(page, SELECTORS.estrategia)) {
        const numEst = await getPrimeNgDropdownOptionsCount(page, SELECTORS.estrategia);
        for (let e = 0; e < numEst; e++) {
            await selectPrimeNgDropdownOption(page, SELECTORS.estrategia, e);
            await new Promise(r => setTimeout(r, 1000));
            await doDownload(page, downloadPath, `${basePrefix}_est-${e}`);
        }
    } else {
        await doDownload(page, downloadPath, basePrefix);
    }
}

export async function scrapeRelatorioSolicitacoes(page: Page, moduleName: string, targetUrl: string): Promise<void> {
    const log = logger.forMethod('scrapeRelatorioSolicitacoes');

    const urlObj = new URL(targetUrl);
    const treatedLinkName = urlObj.pathname.split('/').filter(Boolean).join('-').toLowerCase() || 'relatorio-solicitacoes';
    const downloadPath = path.resolve(process.cwd(), 'downloads', moduleName, treatedLinkName);

    await setupDownloadBehavior(page, downloadPath);

    log.info(`Navegando para ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'networkidle2' });

    for (const radio of RADIO_OPTIONS) {
        log.info(`Selecionando tipo de visualização: ${radio.prefix}`);
        await selectPrimeNgRadioButton(page, radio.id);
        await new Promise(r => setTimeout(r, 1000));

        const numUfs = await getPrimeNgDropdownOptionsCount(page, SELECTORS.uf);
        for (let u = 0; u < numUfs; u++) {
            await selectPrimeNgDropdownOption(page, SELECTORS.uf, u);
            await new Promise(r => setTimeout(r, 1000));

            if (await isDropdownActive(page, SELECTORS.municipio)) {
                const numMuns = await getPrimeNgDropdownOptionsCount(page, SELECTORS.municipio);
                for (let m = 0; m < numMuns; m++) {
                    await selectPrimeNgDropdownOption(page, SELECTORS.municipio, m);
                    await new Promise(r => setTimeout(r, 1000));
                    await iterateTiposEEstrategias(page, downloadPath, `${radio.prefix}_uf-${u}_mun-${m}`);
                }
            } else {
                await iterateTiposEEstrategias(page, downloadPath, `${radio.prefix}_uf-${u}`);
            }
        }
    }

    log.info('Extração finalizada para: Relatório de Solicitações.');
}