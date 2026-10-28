// src/scrapers/sisab_ativ_coletiva.ts
import { Page } from "puppeteer";
import * as path from "path";
import { new_logger } from "../services/logs.js";
import {
    setupDownloadBehavior,
    triggerDownloadAndSave,
    realClick,
    formatError,
    safeRunCombination
} from "../downloader.js";

const logger = new_logger(import.meta.url);

const SELECTORS = {
    unidGeo: '#unidGeo',
    estadoMunicipio: '#estadoMunicipio',
    competenciaSelect: 'span#competencia select',
    downloadDropdownBtn: '.form-group button[data-toggle="dropdown"]',
    csvOptionLink: '.form-group ul.dropdown-menu a[onclick*="j_idt134"]'
};

async function doDownloadCsv(page: Page, downloadPath: string, filePrefix: string): Promise<void> {
    const log = logger.forMethod('doDownloadCsv');
    log.info(`[${filePrefix}] Disparando download CSV...`);

    try {
        const savedPath = await triggerDownloadAndSave(page, {
            downloadPath,
            fileName: filePrefix,
            trigger: async () => {
                await page.waitForSelector(SELECTORS.downloadDropdownBtn, { visible: true, timeout: 15000 });
                await realClick(page, SELECTORS.downloadDropdownBtn);
                await page.waitForSelector(SELECTORS.csvOptionLink, { visible: true, timeout: 15000 });
                await realClick(page, SELECTORS.csvOptionLink);
            },
            startTimeout: 30000,
            finishTimeout: 180000,
            retries: 2,
            retryDelayMs: 3000,
        });
        log.info(`[${filePrefix}] Download CSV concluído com sucesso: ${savedPath}`);
    } catch (error) {
        log.error({ data: formatError(error) }, `[${filePrefix}] Falha no download CSV:`);
    }
}

async function processCompetencias(page: Page, downloadPath: string, prefix: string): Promise<void> {
    const competencias = await page.evaluate((sel) => {
        const selectEl = document.querySelector<HTMLSelectElement>(sel);
        return Array.from(selectEl?.options || [])
            .map(o => o.value)
            .filter(v => v !== '');
    }, SELECTORS.competenciaSelect);

    for (const comp of competencias) {
        await safeRunCombination(`${prefix}_comp-${comp}`, async () => {
            await page.evaluate((sel, val) => {
                const jq = (window as any).$;
                if (jq && jq(sel).length) {
                    jq(sel).val([val]).multiselect('refresh');
                } else {
                    const el = document.querySelector<HTMLSelectElement>(sel);
                    if (el) {
                        Array.from(el.options).forEach(o => {
                            o.selected = o.value === val;
                        });
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                }
            }, SELECTORS.competenciaSelect, comp);

            await new Promise(r => setTimeout(r, 600));
            await doDownloadCsv(page, downloadPath, `${prefix}_comp-${comp}`);
        });
    }
}

async function processMunicipios(page: Page, downloadPath: string, prefix: string): Promise<void> {
    const estados = await page.evaluate((sel) => {
        const selectEl = document.querySelector<HTMLSelectElement>(sel);
        return Array.from(selectEl?.options || [])
            .map(o => o.value)
            .filter(v => v !== '');
    }, SELECTORS.estadoMunicipio);

    for (const uf of estados) {
        await safeRunCombination(`${prefix}_uf-${uf}`, async () => {
            await page.evaluate((sel, val) => {
                const jq = (window as any).$;
                if (jq && jq(sel).length) {
                    jq(sel).val(val).trigger('change');
                } else {
                    const el = document.querySelector<HTMLSelectElement>(sel);
                    if (el) {
                        el.value = val;
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                }
            }, SELECTORS.estadoMunicipio, uf);

            await new Promise(r => setTimeout(r, 2000));

            await page.evaluate(() => {
                const selectAllMuns = document.querySelector<HTMLInputElement>(
                    '#regioes .multiselect-all input[type="checkbox"]'
                );
                if (selectAllMuns && !selectAllMuns.checked) {
                    selectAllMuns.click();
                }
            });

            await processCompetencias(page, downloadPath, `${prefix}_uf-${uf}`);
        });
    }
}

export async function scrapeSisabAtivColetiva(page: Page, downloadPath: string, targetUrl: string): Promise<void> {
    const log = logger.forMethod('scrapeSisabAtivColetiva');
    const specificDownloadPath = path.join(downloadPath, 'saude-atividade-coletiva');

    await setupDownloadBehavior(page, specificDownloadPath);
    log.info(`Navegando para: ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'networkidle2' });

    const unidades = ['brasil', 'regiao', 'estado', 'regiaoSaude', 'municipio'];

    for (const unid of unidades) {
        await safeRunCombination(`unid-${unid}`, async () => {
            log.info(`Selecionando Unidade Geográfica: ${unid}`);
            await page.evaluate((sel, val) => {
                const jq = (window as any).$;
                if (jq && jq(sel).length) {
                    jq(sel).val(val).trigger('change');
                } else {
                    const el = document.querySelector<HTMLSelectElement>(sel);
                    if (el) {
                        el.value = val;
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                }
            }, SELECTORS.unidGeo, unid);

            await new Promise(r => setTimeout(r, 2000));

            if (unid === 'regiao' || unid === 'estado' || unid === 'regiaoSaude') {
                await page.evaluate(() => {
                    const selectAll = document.querySelector<HTMLInputElement>(
                        '#regioes .multiselect-all input[type="checkbox"]'
                    );
                    if (selectAll && !selectAll.checked) {
                        selectAll.click();
                    }
                });
                await processCompetencias(page, specificDownloadPath, `unid-${unid}`);
            } else if (unid === 'municipio') {
                await processMunicipios(page, specificDownloadPath, `unid-${unid}`);
            } else {
                await processCompetencias(page, specificDownloadPath, `unid-${unid}`);
            }
        });
    }

    log.info('Extração finalizada para: Saúde/Atividade Coletiva (SISAB).');
}