// src/scrapers/solicitacoes_adesao.ts
import { Page } from "puppeteer";
import * as path from "path";
import * as fs from "fs";
import { new_logger } from "../services/logs.js";
import { getPrimeNgDropdownOptionsCount, selectPrimeNgDropdownOption } from "../primeng_helpers.js";
import { setupDownloadBehavior, getFilesInDir, waitForNewDownloadAndRename } from "../downloader.js";

const logger = new_logger(import.meta.url);

const SELECTORS = {
    programa: 'p-dropdown[formcontrolname="estrategiaSelecionada"]',
    gestao: 'p-dropdown[formcontrolname="gestaoSelecionada"]',
    uf: 'p-dropdown[formcontrolname="estadoSelecionado"]',
    municipio: 'p-dropdown[formcontrolname="municipioSelecionado"]',
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
            response => response.url().includes('/solicitacoes-adesao') && response.request().method() === 'GET',
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
        await selectPrimeNgDropdownOption(page, SELECTORS.programa, p);
        await new Promise(r => setTimeout(r, 1000));

        const numGestoes = await getPrimeNgDropdownOptionsCount(page, SELECTORS.gestao);
        for (let g = 0; g < numGestoes; g++) {
            await selectPrimeNgDropdownOption(page, SELECTORS.gestao, g);
            await new Promise(r => setTimeout(r, 1000));

            const numUfs = await getPrimeNgDropdownOptionsCount(page, SELECTORS.uf);
            for (let u = 0; u < numUfs; u++) {
                await selectPrimeNgDropdownOption(page, SELECTORS.uf, u);
                await new Promise(r => setTimeout(r, 1000));

                if (await isDropdownActive(page, SELECTORS.municipio)) {
                    const numMunicipios = await getPrimeNgDropdownOptionsCount(page, SELECTORS.municipio);
                    for (let m = 0; m < numMunicipios; m++) {
                        await selectPrimeNgDropdownOption(page, SELECTORS.municipio, m);
                        await new Promise(r => setTimeout(r, 500));

                        await doDownload(page, downloadPath, `prog-${p}_gest-${g}_uf-${u}_mun-${m}`);
                    }
                } else {
                    await doDownload(page, downloadPath, `prog-${p}_gest-${g}_uf-${u}`);
                }
            }
        }
    }

    log.info('Extração finalizada para: Solicitações de Adesão.');
}