// src/scrapers/sisab_validacao.ts
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
    periodoRadios: [
        { id: 'periodo\\:0', label: 'producao' },
        { id: 'periodo\\:1', label: 'envio' }
    ],
    competenciaSelect: 'span#competencia select',
    multiselectAllBtn: 'span#filtrosLinhaColunaRelatorio .multiselect-all input[type="checkbox"]',
    downloadDropdownBtn: '.form-group button[data-toggle="dropdown"]',
    csvOptionLink: '.form-group ul.dropdown-menu a[onclick*="j_idt102"]'
};

async function ensureAllColumnsSelected(page: Page): Promise<void> {
    await page.evaluate(() => {
        const selectAllInput = document.querySelector<HTMLInputElement>(
            'span#filtrosLinhaColunaRelatorio .multiselect-all input[type="checkbox"]'
        );
        if (selectAllInput && !selectAllInput.checked) {
            selectAllInput.click();
        }
    });
}

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

async function processPeriodosECompetencias(page: Page, downloadPath: string, prefix: string): Promise<void> {
    for (const periodo of SELECTORS.periodoRadios) {
        await safeRunCombination(`${prefix}_per-${periodo.label}`, async () => {
            await page.click(`label[for="${periodo.id}"]`);
            await new Promise(r => setTimeout(r, 1000));

            const competencias = await page.evaluate((sel) => {
                const selectEl = document.querySelector<HTMLSelectElement>(sel);
                return Array.from(selectEl?.options || [])
                    .map(o => o.value)
                    .filter(v => v !== '');
            }, SELECTORS.competenciaSelect);

            for (const comp of competencias) {
                await safeRunCombination(`${prefix}_per-${periodo.label}_comp-${comp}`, async () => {
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
                    }, SELECTORS.competenciaSelect, comp);

                    await new Promise(r => setTimeout(r, 1000));
                    await ensureAllColumnsSelected(page);
                    await doDownloadCsv(page, downloadPath, `${prefix}_per-${periodo.label}_comp-${comp}`);
                });
            }
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

            await processPeriodosECompetencias(page, downloadPath, `${prefix}_uf-${uf}`);
        });
    }
}

export async function scrapeSisabValidacao(page: Page, downloadPath: string, targetUrl: string): Promise<void> {
    const log = logger.forMethod('scrapeSisabValidacao');
    const specificDownloadPath = path.join(downloadPath, 'validacao');

    await setupDownloadBehavior(page, specificDownloadPath);
    log.info(`Navegando para: ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'networkidle2' });

    const unidades = ['brasil', 'regiao', 'estado', 'municipio'];

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

            if (unid === 'regiao' || unid === 'estado') {
                await page.evaluate(() => {
                    const selectAll = document.querySelector<HTMLInputElement>(
                        '#regioes .multiselect-all input[type="checkbox"]'
                    );
                    if (selectAll && !selectAll.checked) {
                        selectAll.click();
                    }
                });
                await processPeriodosECompetencias(page, specificDownloadPath, `unid-${unid}`);
            } else if (unid === 'municipio') {
                await processMunicipios(page, specificDownloadPath, `unid-${unid}`);
            } else {
                await processPeriodosECompetencias(page, specificDownloadPath, `unid-${unid}`);
            }
        });
    }

    log.info('Extração finalizada para: Validação SISAB.');
}