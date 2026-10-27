// src/scrapers/sisab_indicador_painel.ts
import { Page } from "puppeteer";
import * as path from "path";
import { new_logger } from "../services/logs.js";
import { setupDownloadBehavior, getFilesInDir, waitForNewDownloadAndRename } from "../downloader.js";

const logger = new_logger(import.meta.url);

const SELECTORS = {
    modalOkBtn: '#modal .modal-body button[data-dismiss="modal"]',
    indicador: '#coIndicador',
    selectLinha: '#selectLinha',
    estadoMunicipio: '#estadoMunicipio',
    quadrimestre: '#quadrimestre',
    visaoEquipe: '#visaoEquipe',
    downloadDropdownBtn: '.form-group button[data-toggle="dropdown"]',
    csvOptionLink: '.form-group ul.dropdown-menu a[onclick*="j_idt87"]'
};

async function dismissModalIfPresent(page: Page): Promise<void> {
    try {
        await page.waitForSelector(SELECTORS.modalOkBtn, { visible: true, timeout: 5000 });
        await page.click(SELECTORS.modalOkBtn);
        await page.waitForSelector('#modal', { hidden: true, timeout: 5000 });
    } catch {
        // Modal não apareceu ou já foi fechado
    }
}

async function doDownloadCsv(page: Page, downloadPath: string, filePrefix: string): Promise<void> {
    const log = logger.forMethod('doDownloadCsv');
    const filesBefore = getFilesInDir(downloadPath);

    log.info(`[${filePrefix}] Disparando download CSV...`);
    await page.waitForSelector(SELECTORS.downloadDropdownBtn, { visible: true });
    await page.click(SELECTORS.downloadDropdownBtn);

    await page.waitForSelector(SELECTORS.csvOptionLink, { visible: true });
    await page.click(SELECTORS.csvOptionLink);

    try {
        await waitForNewDownloadAndRename(downloadPath, filesBefore, filePrefix, 120000);
        log.info(`[${filePrefix}] Download CSV concluído com sucesso.`);
    } catch (error) {
        log.error({ data: JSON.stringify(error, null, 4) }, `[${filePrefix}] Falha no download CSV:`);
    }
}

async function processQuadrimestresEEquipes(page: Page, downloadPath: string, prefix: string): Promise<void> {
    const quadrimestres = await page.evaluate((sel) => {
        const selectEl = document.querySelector<HTMLSelectElement>(sel);
        return Array.from(selectEl?.options || [])
            .map(o => o.value)
            .filter(v => v !== '');
    }, SELECTORS.quadrimestre);

    const visoes = await page.evaluate((sel) => {
        const selectEl = document.querySelector<HTMLSelectElement>(sel);
        return Array.from(selectEl?.options || []).map(o => o.value);
    }, SELECTORS.visaoEquipe);

    for (const quad of quadrimestres) {
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
        }, SELECTORS.quadrimestre, quad);

        for (const visao of visoes) {
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
            }, SELECTORS.visaoEquipe, visao);

            await new Promise(r => setTimeout(r, 500));
            const visaoSlug = visao === '' ? 'todas' : visao.replace(/\|/g, '_');
            await doDownloadCsv(page, downloadPath, `${prefix}_quad-${quad}_visao-${visaoSlug}`);
        }
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

        await processQuadrimestresEEquipes(page, downloadPath, `${prefix}_uf-${uf}`);
    }
}

async function processNiveisVisualizacao(page: Page, downloadPath: string, prefix: string): Promise<void> {
    const niveis = ['nacional', 'regiao', 'uf', 'ibge'];

    for (const nivel of niveis) {
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
        }, SELECTORS.selectLinha, nivel);

        await new Promise(r => setTimeout(r, 2000));

        if (nivel === 'regiao' || nivel === 'uf') {
            await page.evaluate(() => {
                const selectAll = document.querySelector<HTMLInputElement>(
                    '#regioes .multiselect-all input[type="checkbox"]'
                );
                if (selectAll && !selectAll.checked) {
                    selectAll.click();
                }
            });
            await processQuadrimestresEEquipes(page, downloadPath, `${prefix}_nivel-${nivel}`);
        } else if (nivel === 'ibge') {
            await processMunicipios(page, downloadPath, `${prefix}_nivel-${nivel}`);
        } else {
            await processQuadrimestresEEquipes(page, downloadPath, `${prefix}_nivel-${nivel}`);
        }
    }
}

export async function scrapeSisabIndicadorPainel(page: Page, downloadPath: string, targetUrl: string): Promise<void> {
    const log = logger.forMethod('scrapeSisabIndicadorPainel');
    const specificDownloadPath = path.join(downloadPath, 'indicador-painel');

    await setupDownloadBehavior(page, specificDownloadPath);
    log.info(`Navegando para: ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'networkidle2' });

    await dismissModalIfPresent(page);

    const indicadores = await page.evaluate((sel) => {
        const selectEl = document.querySelector<HTMLSelectElement>(sel);
        return Array.from(selectEl?.options || []).map(o => o.value);
    }, SELECTORS.indicador);

    for (const ind of indicadores) {
        const indLabel = ind === '' ? 'visao-geral' : ind;
        log.info(`Processando Indicador: ${indLabel}`);

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
            if (typeof (window as any).opcoesIndicador === 'function') {
                (window as any).opcoesIndicador(val, false);
            }
        }, SELECTORS.indicador, ind);

        await new Promise(r => setTimeout(r, 1000));
        await processNiveisVisualizacao(page, specificDownloadPath, `ind-${indLabel}`);
    }

    log.info('Extração finalizada para: Indicadores de Desempenho (Painel SISAB).');
}