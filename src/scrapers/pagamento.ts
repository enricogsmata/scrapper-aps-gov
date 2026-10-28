// src/scrapers/pagamento.ts
import { Page } from "puppeteer";
import * as path from "path";
import { new_logger } from "../services/logs.js";
import { getPrimeNgDropdownOptionsCount, selectPrimeNgDropdownOption, isDropdownActive } from "../primeng_helpers.js";
import {
    setupDownloadBehavior,
    triggerDownloadAndSave,
    realClick,
    formatError,
    safeDownloadJsonFromResponse,
    safeRunCombination
} from "../downloader.js";
import { scrapePagamentoHistorico } from "./pagamento-historico.js";

const logger = new_logger(import.meta.url);

const SELECTORS = {
    tipoUnidade: 'p-dropdown[formcontrolname="tipoUnidade"]',
    estado: 'p-dropdown[formcontrolname="estadoSelecionado"]',
    municipio: 'p-dropdown[formcontrolname="municipioSelecionado"]',
    ano: 'p-dropdown[formcontrolname="periodoSelecionado"]',
    inicio: 'p-dropdown[formcontrolname="parcelaInicioSelecionada"]',
    fim: 'p-dropdown[formcontrolname="parcelaFimSelecionada"]',
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
                '/financiamento/pagamento',
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

async function processAnoEParcelas(page: Page, downloadPath: string, prefix: string): Promise<void> {
    const numAnos = await getPrimeNgDropdownOptionsCount(page, SELECTORS.ano);
    for (let y = 0; y < numAnos; y++) {
        await safeRunCombination(`${prefix}_ano-${y}`, async () => {
            await selectPrimeNgDropdownOption(page, SELECTORS.ano, y);
            await new Promise(r => setTimeout(r, 1000));

            const numInicio = await getPrimeNgDropdownOptionsCount(page, SELECTORS.inicio);
            for (let s = 0; s < numInicio; s++) {
                await safeRunCombination(`${prefix}_ano-${y}_ini-${s}`, async () => {
                    await selectPrimeNgDropdownOption(page, SELECTORS.inicio, s);
                    await new Promise(r => setTimeout(r, 500));

                    if (await isDropdownActive(page, SELECTORS.fim)) {
                        const numFim = await getPrimeNgDropdownOptionsCount(page, SELECTORS.fim);
                        for (let f = 0; f < numFim; f++) {
                            await safeRunCombination(`${prefix}_ano-${y}_ini-${s}_fim-${f}`, async () => {
                                await selectPrimeNgDropdownOption(page, SELECTORS.fim, f);
                                await new Promise(r => setTimeout(r, 500));
                                await doDownload(page, downloadPath, `${prefix}_ano-${y}_ini-${s}_fim-${f}`);
                            });
                        }
                    } else {
                        await doDownload(page, downloadPath, `${prefix}_ano-${y}_ini-${s}`);
                    }
                });
            }
        });
    }
}

export async function scrapePagamento(page: Page, moduleName: string, targetUrl: string): Promise<void> {
    const log = logger.forMethod('scrapePagamento');

    const urlObj = new URL(targetUrl);
    const treatedLinkName = urlObj.pathname.split('/').filter(Boolean).join('-').toLowerCase() || 'pagamento';
    const downloadPath = path.resolve(process.cwd(), 'downloads', moduleName, treatedLinkName);

    await setupDownloadBehavior(page, downloadPath);

    log.info(`Navegando para ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'networkidle2' });

    const numTipos = await getPrimeNgDropdownOptionsCount(page, SELECTORS.tipoUnidade);

    for (let i = 0; i < numTipos; i++) {
        await safeRunCombination(`tipo-${i}`, async () => {
            await selectPrimeNgDropdownOption(page, SELECTORS.tipoUnidade, i);
            await new Promise(r => setTimeout(r, 1000));

            const numEstados = await getPrimeNgDropdownOptionsCount(page, SELECTORS.estado);
            for (let j = 0; j < numEstados; j++) {
                await safeRunCombination(`tipo-${i}_est-${j}`, async () => {
                    await selectPrimeNgDropdownOption(page, SELECTORS.estado, j);
                    await new Promise(r => setTimeout(r, 1500));

                    if (await isDropdownActive(page, SELECTORS.municipio)) {
                        const numMuns = await getPrimeNgDropdownOptionsCount(page, SELECTORS.municipio);
                        for (let k = 0; k < numMuns; k++) {
                            await safeRunCombination(`tipo-${i}_est-${j}_mun-${k}`, async () => {
                                await selectPrimeNgDropdownOption(page, SELECTORS.municipio, k);
                                await new Promise(r => setTimeout(r, 1000));
                                await processAnoEParcelas(page, downloadPath, `tipo-${i}_est-${j}_mun-${k}`);
                            });
                        }
                    } else {
                        await processAnoEParcelas(page, downloadPath, `tipo-${i}_est-${j}`);
                    }
                });
            }
        });
    }

    log.info('Extraindo links de relatórios históricos...');
    const historicoLinks = await page.$$eval('.relatorios-anteriores__lista a', (els) =>
        els.map(a => (a as HTMLAnchorElement).href)
    );

    const historicoPath = path.join(downloadPath, 'historico');
    for (const link of historicoLinks) {
        const histPage = await page.browser().newPage();
        try {
            await scrapePagamentoHistorico(histPage, historicoPath, link);
        } catch (error) {
            log.error({ data: formatError(error) }, `Erro ao extrair histórico de pagamento (${link}):`);
        } finally {
            await histPage.close();
        }
    }

    log.info('Extração finalizada para: Pagamento (Financiamento).');
}