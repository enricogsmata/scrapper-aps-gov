// src/scrapers/relatorio_solicitacoes.ts
import { Page } from "puppeteer";
import * as path from "path";
import { new_logger } from "../../services/logs.js";
import {
    getPrimeNgDropdownOptionsCount,
    selectPrimeNgDropdownOption,
    selectPrimeNgRadioButton,
    isDropdownActive
} from "../primeng_helpers.js";
import {
    setupDownloadBehavior,
    triggerDownloadAndSave,
    realClick,
    formatError,
    safeRunCombination
} from "../downloader.js";

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
    situacao: 'p-dropdown#tipo',
    tipoConsolidado: 'p-dropdown#tipoConsolidado',
    tipoAlteracaoTipologia: 'p-dropdown#tipoAlteracaoTipologia',
    btnDownloadModal: 'div.buttons-container button.br-button.secondary',
    btnAplicarFiltro: 'div.buttons-container button.br-button.primary',
    btnDownloadTabela: 'app-table-relatorio-solicitacoes button.border-none',
    tabelaRelatorio: 'app-table-relatorio-solicitacoes table.p-datatable-table'
};

const DYNAMIC_DROPDOWNS = [
    { key: 'situacao', selector: SELECTORS.situacao },
    { key: 'tipoConsolidado', selector: SELECTORS.tipoConsolidado },
    { key: 'tipoSolicitacao', selector: SELECTORS.tipoSolicitacao },
    { key: 'estrategia', selector: SELECTORS.estrategia },
    { key: 'tipoAlteracaoTipologia', selector: SELECTORS.tipoAlteracaoTipologia }
];

async function doDownload(page: Page, downloadPath: string, filePrefix: string): Promise<void> {
    const log = logger.forMethod('doDownload');

    const isModalDownloadDisabled = await page.evaluate((sel) => {
        const el = document.querySelector<HTMLButtonElement>(sel);
        return !el || el.disabled || el.classList.contains('p-disabled');
    }, SELECTORS.btnDownloadModal);

    try {
        if (!isModalDownloadDisabled) {
            log.info(`[${filePrefix}] Download direto habilitado no modal.`);
            await triggerDownloadAndSave(page, {
                downloadPath,
                fileName: filePrefix,
                trigger: () => realClick(page, SELECTORS.btnDownloadModal),
                startTimeout: 30000,
                finishTimeout: 180000,
                retries: 2,
                retryDelayMs: 3000,
            });
        } else {
            log.info(`[${filePrefix}] Download bloqueado no modal. Aplicando filtro para download da tabela...`);
            await realClick(page, SELECTORS.btnAplicarFiltro);
            await page.waitForSelector(SELECTORS.tabelaRelatorio, { visible: true, timeout: 60000 });
            await page.waitForSelector(SELECTORS.btnDownloadTabela, { visible: true, timeout: 60000 });

            await triggerDownloadAndSave(page, {
                downloadPath,
                fileName: filePrefix,
                trigger: () => realClick(page, SELECTORS.btnDownloadTabela),
                startTimeout: 30000,
                finishTimeout: 180000,
                retries: 2,
                retryDelayMs: 3000,
            });
        }
        log.info(`[${filePrefix}] Download realizado e renomeado com sucesso.`);
    } catch (error) {
        log.error({ data: formatError(error) }, `[${filePrefix}] Falha no download:`);
    }
}

async function iterateDynamicDropdowns(
    page: Page,
    dropdowns: typeof DYNAMIC_DROPDOWNS,
    currentIndex: number,
    downloadPath: string,
    currentPrefix: string
): Promise<void> {
    if (currentIndex >= dropdowns.length) {
        await doDownload(page, downloadPath, currentPrefix);
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
                await iterateDynamicDropdowns(page, dropdowns, currentIndex + 1, downloadPath, nextPrefix);
            });
        }
    } else {
        await iterateDynamicDropdowns(page, dropdowns, currentIndex + 1, downloadPath, currentPrefix);
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
            await safeRunCombination(`${radio.prefix}_uf-${u}`, async () => {
                await selectPrimeNgDropdownOption(page, SELECTORS.uf, u);
                await new Promise(r => setTimeout(r, 1000));

                if (await isDropdownActive(page, SELECTORS.municipio)) {
                    const numMuns = await getPrimeNgDropdownOptionsCount(page, SELECTORS.municipio);
                    for (let m = 0; m < numMuns; m++) {
                        await safeRunCombination(`${radio.prefix}_uf-${u}_mun-${m}`, async () => {
                            await selectPrimeNgDropdownOption(page, SELECTORS.municipio, m);
                            await new Promise(r => setTimeout(r, 1000));
                            await iterateDynamicDropdowns(page, DYNAMIC_DROPDOWNS, 0, downloadPath, `${radio.prefix}_uf-${u}_mun-${m}`);
                        });
                    }
                } else {
                    await iterateDynamicDropdowns(page, DYNAMIC_DROPDOWNS, 0, downloadPath, `${radio.prefix}_uf-${u}`);
                }
            });
        }
    }

    log.info('Extração finalizada para: Relatório de Solicitações.');
}