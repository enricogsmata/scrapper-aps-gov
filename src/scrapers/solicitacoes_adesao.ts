// src/scrapers/solicitacoes_adesao.ts
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

const logger = new_logger(import.meta.url);

const SELECTORS = {
    programa: 'p-dropdown[formcontrolname="estrategiaSelecionada"]',
    gestao: 'p-dropdown[formcontrolname="gestaoSelecionada"]',
    uf: 'p-dropdown[formcontrolname="estadoSelecionado"]',
    municipio: 'p-dropdown[formcontrolname="municipioSelecionado"]',
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
                '/solicitacoes-adesao',
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

export async function scrapeSolicitacoesAdesao(page: Page, moduleName: string, targetUrl: string): Promise<void> {
    const log = logger.forMethod('scrapeSolicitacoesAdesao');

    const urlObj = new URL(targetUrl);
    const treatedLinkName = urlObj.pathname.split('/').filter(Boolean).join('-').toLowerCase() || 'solicitacoes-adesao';
    const downloadPath = path.resolve(process.cwd(), 'downloads', moduleName, treatedLinkName);

    await setupDownloadBehavior(page, downloadPath);

    log.info(`Navegando para ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'networkidle2' });

    const numProgramas = await getPrimeNgDropdownOptionsCount(page, SELECTORS.programa);

    for (let p = 0; p < numProgramas; p++) {
        await safeRunCombination(`prog-${p}`, async () => {
            await selectPrimeNgDropdownOption(page, SELECTORS.programa, p);
            await new Promise(r => setTimeout(r, 1000));

            const numGestoes = await getPrimeNgDropdownOptionsCount(page, SELECTORS.gestao);
            for (let g = 0; g < numGestoes; g++) {
                await safeRunCombination(`prog-${p}_gest-${g}`, async () => {
                    await selectPrimeNgDropdownOption(page, SELECTORS.gestao, g);
                    await new Promise(r => setTimeout(r, 1000));

                    const numUfs = await getPrimeNgDropdownOptionsCount(page, SELECTORS.uf);
                    for (let u = 0; u < numUfs; u++) {
                        await safeRunCombination(`prog-${p}_gest-${g}_uf-${u}`, async () => {
                            await selectPrimeNgDropdownOption(page, SELECTORS.uf, u);
                            await new Promise(r => setTimeout(r, 1000));

                            if (await isDropdownActive(page, SELECTORS.municipio)) {
                                const numMunicipios = await getPrimeNgDropdownOptionsCount(page, SELECTORS.municipio);
                                for (let m = 0; m < numMunicipios; m++) {
                                    await safeRunCombination(`prog-${p}_gest-${g}_uf-${u}_mun-${m}`, async () => {
                                        await selectPrimeNgDropdownOption(page, SELECTORS.municipio, m);
                                        await new Promise(r => setTimeout(r, 500));
                                        await doDownload(page, downloadPath, `prog-${p}_gest-${g}_uf-${u}_mun-${m}`);
                                    });
                                }
                            } else {
                                await doDownload(page, downloadPath, `prog-${p}_gest-${g}_uf-${u}`);
                            }
                        });
                    }
                });
            }
        });
    }

    log.info('Extração finalizada para: Solicitações de Adesão.');
}