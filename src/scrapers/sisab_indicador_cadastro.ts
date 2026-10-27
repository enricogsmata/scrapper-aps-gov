// src/scrapers/sisab_indicador_cadastro.ts
import { Page } from "puppeteer";
import * as path from "path";
import { new_logger } from "../services/logs.js";
import { setupDownloadBehavior, getFilesInDir, waitForNewDownloadAndRename } from "../downloader.js";

const logger = new_logger(import.meta.url);

const SELECTORS = {
    selectLinha: '#selectLinha',
    estadoMunicipio: '#estadoMunicipio',
    condicaoEquipes: '#opacao-capitacao',
    beneficiariosCheckbox: '#beneficiarios',
    competenciaSelect: '#competencia',
    downloadDropdownBtn: '.form-group button[data-toggle="dropdown"]',
    csvOptionLink: '.form-group ul.dropdown-menu a[onclick*="j_idt85"]'
};

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

async function processCompetenciasECondicoes(page: Page, downloadPath: string, prefix: string): Promise<void> {
    const condicoes = await page.evaluate((sel) => {
        const selectEl = document.querySelector<HTMLSelectElement>(sel);
        return Array.from(selectEl?.options || []).map(o => o.value);
    }, SELECTORS.condicaoEquipes);

    const competencias = await page.evaluate((sel) => {
        const selectEl = document.querySelector<HTMLSelectElement>(sel);
        return Array.from(selectEl?.options || [])
            .map(o => o.value)
            .filter(v => v !== '');
    }, SELECTORS.competenciaSelect);

    const ponderacaoOptions = [false, true];

    for (const cond of condicoes) {
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
        }, SELECTORS.condicaoEquipes, cond);

        const condLabel = cond === '' ? 'todas' : cond.replace(/\|/g, '_');

        for (const ponderacao of ponderacaoOptions) {
            await page.evaluate((sel, checked) => {
                const el = document.querySelector<HTMLInputElement>(sel);
                if (el && el.checked !== checked) {
                    el.click();
                }
            }, SELECTORS.beneficiariosCheckbox, ponderacao);

            const pondLabel = ponderacao ? 'comPonderacao' : 'semPonderacao';

            for (const comp of competencias) {
                await page.evaluate((sel, val) => {
                    const jq = (window as any).$;
                    if (jq && jq(sel).length) {
                        jq(sel).val([val]).multiselect('refresh');
                    } else {
                        const selectEl = document.querySelector<HTMLSelectElement>(sel);
                        if (selectEl) {
                            Array.from(selectEl.options).forEach(o => {
                                o.selected = (o.value === val);
                            });
                            selectEl.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                    }
                }, SELECTORS.competenciaSelect, comp);

                await new Promise(r => setTimeout(r, 500));
                await doDownloadCsv(
                    page,
                    downloadPath,
                    `${prefix}_cond-${condLabel}_${pondLabel}_comp-${comp}`
                );
            }
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

        await processCompetenciasECondicoes(page, downloadPath, `${prefix}_uf-${uf}`);
    }
}

async function processNiveisVisualizacao(page: Page, downloadPath: string): Promise<void> {
    const niveis = ['nacional', 'regiao', 'uf', 'ibge', 'cnes', 'ine', 'cnes_ine'];

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
            await processCompetenciasECondicoes(page, downloadPath, `nivel-${nivel}`);
        } else if (['ibge', 'cnes', 'ine', 'cnes_ine'].includes(nivel)) {
            await processMunicipios(page, downloadPath, `nivel-${nivel}`);
        } else {
            await processCompetenciasECondicoes(page, downloadPath, `nivel-${nivel}`);
        }
    }
}

export async function scrapeSisabIndicadorCadastro(page: Page, downloadPath: string, targetUrl: string): Promise<void> {
    const log = logger.forMethod('scrapeSisabIndicadorCadastro');
    const specificDownloadPath = path.join(downloadPath, 'indicador-cadastro');

    await setupDownloadBehavior(page, specificDownloadPath);
    log.info(`Navegando para: ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'networkidle2' });

    await processNiveisVisualizacao(page, specificDownloadPath);

    log.info('Extração finalizada para: Cadastros Vinculados (SISAB).');
}