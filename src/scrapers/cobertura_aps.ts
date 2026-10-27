// src/scrapers/cobertura_aps.ts
import { Page } from "puppeteer";
import * as path from "path";
import * as fs from "fs";
import { new_logger } from "../services/logs.js";
import { getPrimeNgDropdownOptionsCount, selectPrimeNgDropdownOption } from "../primeng_helpers.js";
import { setupDownloadBehavior, triggerDownloadAndSave } from "../downloader.js";
import { scrapeCoberturaHistorico } from "./cobertura_historico.js";

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

function errorMessage(error: unknown): string {
    // JSON.stringify(new Error(...)) retorna "{}" (message/stack não são enumeráveis),
    // por isso o log anterior mostrava data: "{}".
    return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

async function isDropdownActive(page: Page, selector: string): Promise<boolean> {
    return page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return false;
        const dropdown = el.querySelector('.p-dropdown');
        if (!dropdown) return false;
        return !dropdown.classList.contains('p-disabled') && (dropdown as HTMLElement).offsetParent !== null;
    }, selector);
}

/**
 * Clique "de verdade" (mouse do Puppeteer) no botão. Diferente de btn.click() dentro do
 * page.evaluate, gera um evento confiável (isTrusted) com ativação do usuário, o que evita
 * que o Chrome bloqueie downloads disparados sem gesto do usuário.
 */
async function realClick(page: Page, selector: string): Promise<void> {
    const handle = await page.waitForSelector(selector, { visible: true, timeout: 15000 });
    if (!handle) throw new Error(`Elemento não encontrado: ${selector}`);
    // block: 'center' evita que o header sticky cubra o botão
    await handle.evaluate((el) => (el as HTMLElement).scrollIntoView({ behavior: 'instant', block: 'center' }));
    await new Promise((r) => setTimeout(r, 500));
    await handle.click();
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
            response => response.url().includes('/cobertura/aps') && response.request().method() === 'GET',
            { timeout: 60000 }
        );

        await page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
        });
        await new Promise((r) => setTimeout(r, 1000));

        await page.evaluate((sel) => {
            const btn = document.querySelector<HTMLButtonElement>(sel);
            btn?.scrollIntoView({ behavior: 'instant', block: 'center' });
            btn?.click();
        }, SELECTORS.btnVerTela);

        try {
            const response = await responsePromise;
            const json = await response.json();

            const filePath = path.join(downloadPath, `${filePrefix}.json`);
            fs.writeFileSync(filePath, JSON.stringify(json, null, 2));
            log.info(`[${filePrefix}] Dados salvos em JSON com sucesso.`);
        } catch (error) {
            log.error({ data: errorMessage(error) }, `[${filePrefix}] Falha ao interceptar requisição JSON:`);
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
            });
            log.info(`[${filePrefix}] Arquivo baixado e renomeado com sucesso: ${path.basename(savedPath)}`);
        } catch (error) {
            log.error({ data: errorMessage(error) }, `[${filePrefix}] Falha no download do arquivo:`);
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

export async function scrapeCoberturaAps(page: Page, moduleName: string, targetUrl: string): Promise<void> {
    const log = logger.forMethod('scrapeCoberturaAps');

    const urlObj = new URL(targetUrl);
    const treatedLinkName = urlObj.pathname.split('/').filter(Boolean).join('-').toLowerCase() || 'cobertura-aps';
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

    log.info('Extraindo links dos relatórios históricos de cobertura...');
    const historicoLinks = await page.$$eval('.relatorios-anteriores__lista a', (els) =>
        els.map(a => (a as HTMLAnchorElement).href)
    );

    const historicoDownloadPath = path.join(downloadPath, 'historico');
    for (const link of historicoLinks) {
        const histPage = await page.browser().newPage();
        try {
            await scrapeCoberturaHistorico(histPage, historicoDownloadPath, link);
        } finally {
            await histPage.close();
        }
    }

    log.info('Extração finalizada para: Cobertura Potencial da APS.');
}