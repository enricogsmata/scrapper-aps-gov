// src/scrapers/micronutrientes.ts
import { Page } from "puppeteer";
import * as path from "path";
import { new_logger } from "../../services/logs.js";
import {
    setupDownloadBehavior,
    triggerDownloadAndSave,
    realClick,
    formatError,
    safeRunCombination
} from "../downloader.js";

const logger = new_logger(import.meta.url);

const SELECTORS = {
    btnHomeVitaminaA: 'a[ng-click*="vitaminaa/relatorio"]',
    btnHomeFerro: 'a[ng-click*="ferro/relatorio"]',
    btnHomeNutriSus: 'a[ng-click*="nutrisus/relatorio"]',
    tabelaArquivosLinks: '.box.box-solid table.table tbody tr td a[href$=".xlsx"], .box.box-solid table.table tbody tr td a[href$=".csv"]',
    btnCardVitaminaSuplementadas: 'a.showSingle[target="1"][ng-click*="relatorioAtivo(1)"]',
    btnCardVitaminaPerda: 'a.showSingle[target="3"][ng-click*="relatorioAtivo(2)"]',
    btnCardFerroCrianca: 'a.showSingle[target="1"][ng-click*="relatorioAtivo(1)"]',
    btnCardFerroGestante: 'a.showSingle[target="3"][ng-click*="relatorioAtivo(2)"]',
    btnCardFerroAcidoFolico: 'a.showSingle[target="4"][ng-click*="relatorioAtivo(3)"]',
    btnCardNutriSusPrimeiroCiclo: 'a.showSingle[target="1"][ng-click*="relatorioAtivo(1)"]',
    btnCardNutriSusSegundoCiclo: 'a.showSingle[target="3"][ng-click*="relatorioAtivo(2)"]',
    btnTrocarRelatorio: 'a.showSingle[ng-click*="reset()"]',
    selectAno: 'select#nuAno',
    selectMes: 'select#nuMes',
    selectCiclo: 'select#nuCiclo',
    selectAgrupador: 'select#tpFiltro',
    selectRegiao: 'select#coRegiao',
    selectEstado: 'select#coUfIbge',
    selectMunicipio: 'select#coMunicipioIbge',
    selectDsei: 'select#coDSEI',
    selectTipoCreche: 'select[name="tpCreche"]',
    btnVisualizarEmTela: 'button#TELA',
    btnGerarExcelForm: 'form[action*="/relatorio/tela"] button[type="submit"]',
    btnExportExcelDataTable: 'a.dt-button.buttons-excel'
};

async function getSelectOptions(page: Page, selector: string): Promise<Array<{ value: string; text: string }>> {
    return page.$$eval(`${selector} option`, (options) =>
        options
            .map((opt) => ({
                value: (opt as HTMLOptionElement).value,
                text: (opt as HTMLOptionElement).textContent?.trim() || ""
            }))
            .filter((opt) => opt.value !== "" && !opt.value.includes("?") && opt.text.toUpperCase() !== "-SELECIONE-")
    );
}

async function triggerDownloadFromNewTab(page: Page, downloadPath: string, filePrefix: string): Promise<void> {
    const log = logger.forMethod('triggerDownloadFromNewTab');
    const browser = page.browser();

    try {
        const targetPromise = browser.waitForTarget(
            (target) => target.url().includes('/relatorio/tela') || target.opener() === page.target(),
            { timeout: 30000 }
        );

        await realClick(page, SELECTORS.btnVisualizarEmTela);

        const newTarget = await targetPromise;
        const newPage = await newTarget.page();

        if (!newPage) {
            log.warn(`[${filePrefix}] Não foi possível obter o handle da nova janela de relatório.`);
            return;
        }

        await setupDownloadBehavior(newPage, downloadPath);
        await newPage.waitForNetworkIdle({ idleTime: 1000, timeout: 30000 }).catch(() => { });

        await triggerDownloadAndSave(newPage, {
            downloadPath,
            fileName: filePrefix,
            trigger: async () => {
                const btnExportExcel = await newPage.$(SELECTORS.btnExportExcelDataTable);
                if (btnExportExcel) {
                    await realClick(newPage, SELECTORS.btnExportExcelDataTable);
                    return;
                }
                const btnGerarExcel = await newPage.$(SELECTORS.btnGerarExcelForm);
                if (btnGerarExcel) {
                    await realClick(newPage, SELECTORS.btnGerarExcelForm);
                    return;
                }
                await newPage.waitForSelector(SELECTORS.btnExportExcelDataTable, { visible: true, timeout: 15000 });
                await realClick(newPage, SELECTORS.btnExportExcelDataTable);
            },
            startTimeout: 60000,
            finishTimeout: 300000,
            retries: 2,
            retryDelayMs: 3000
        });

        await newPage.close();
        log.info(`[${filePrefix}] Arquivo baixado e página fechada com sucesso.`);
    } catch (error) {
        log.error({ data: formatError(error) }, `[${filePrefix}] Erro ao processar download na janela aberta:`);
    }
}

async function scrapeArquivosEstaticos(page: Page, downloadPath: string, subfolder: string): Promise<void> {
    const log = logger.forMethod('scrapeArquivosEstaticos');
    const links = await page.$$eval(SELECTORS.tabelaArquivosLinks, (anchors) =>
        anchors.map((a) => (a as HTMLAnchorElement).href)
    );

    log.info(`[${subfolder}] Encontrados ${links.length} arquivos estáticos para download.`);
    for (const url of links) {
        const fileName = path.basename(new URL(url).pathname);
        const prefix = fileName.replace(/\.[^/.]+$/, '');

        await safeRunCombination(`${subfolder}_estatico_${prefix}`, async () => {
            log.info(`[${subfolder}] Baixando arquivo: ${fileName}`);
            await triggerDownloadAndSave(page, {
                downloadPath,
                fileName: prefix,
                trigger: async () => {
                    await page.evaluate((targetUrl) => {
                        const link = Array.from(document.querySelectorAll<HTMLAnchorElement>('.box.box-solid table.table tbody tr td a'))
                            .find(a => a.href === targetUrl);
                        if (link) link.click();
                    }, url);
                },
                startTimeout: 30000,
                finishTimeout: 120000,
                retries: 2,
                retryDelayMs: 3000
            });
        });
    }
}

async function iterateTipoCrecheAndDownload(page: Page, downloadPath: string, currentPrefix: string): Promise<void> {
    const isTipoCrecheVisible = await page.evaluate(() => {
        const select = document.querySelector<HTMLSelectElement>('select[name="tpCreche"]');
        if (!select) return false;
        const formGroup = select.closest('.form-group');
        return Boolean(formGroup && !formGroup.classList.contains('ng-hide'));
    });

    if (isTipoCrecheVisible) {
        const creches = await getSelectOptions(page, SELECTORS.selectTipoCreche);
        for (const creche of creches) {
            const prefixCreche = `${currentPrefix}_creche-${creche.value}`;
            await safeRunCombination(prefixCreche, async () => {
                await page.select(SELECTORS.selectTipoCreche, creche.value);
                await page.evaluate((val) => {
                    const el = document.querySelector<HTMLSelectElement>('select[name="tpCreche"]');
                    if (el) el.dispatchEvent(new Event('change', { bubbles: true }));
                }, creche.value);
                await new Promise((r) => setTimeout(r, 500));
                await triggerDownloadFromNewTab(page, downloadPath, prefixCreche);
            });
        }
    } else {
        await triggerDownloadFromNewTab(page, downloadPath, currentPrefix);
    }
}

async function iterateGeoAndDownload(page: Page, downloadPath: string, currentPrefix: string): Promise<void> {
    const log = logger.forMethod('iterateGeoAndDownload');
    const agrupadores = await getSelectOptions(page, SELECTORS.selectAgrupador);

    for (const ag of agrupadores) {
        const prefixAg = `${currentPrefix}_ag-${ag.value}`;

        await safeRunCombination(prefixAg, async () => {
            log.info(`[${prefixAg}] Selecionando Agrupador: ${ag.text} (${ag.value})`);
            await page.select(SELECTORS.selectAgrupador, ag.value);
            await page.evaluate((val) => {
                const el = document.querySelector<HTMLSelectElement>('select#tpFiltro');
                if (el) el.dispatchEvent(new Event('change', { bubbles: true }));
            }, ag.value);
            await new Promise((r) => setTimeout(r, 800));

            if (ag.value === 'F') {
                await iterateTipoCrecheAndDownload(page, downloadPath, prefixAg);
                return;
            }

            if (ag.value === 'R') {
                await page.waitForSelector(SELECTORS.selectRegiao, { visible: true, timeout: 10000 });
                const regioes = await getSelectOptions(page, SELECTORS.selectRegiao);
                for (const reg of regioes) {
                    const prefixReg = `${prefixAg}_reg-${reg.value}`;
                    await safeRunCombination(prefixReg, async () => {
                        log.info(`[${prefixReg}] Selecionando Região: ${reg.text}`);
                        await page.select(SELECTORS.selectRegiao, reg.value);
                        await page.evaluate((val) => {
                            const el = document.querySelector<HTMLSelectElement>('select#coRegiao');
                            if (el) el.dispatchEvent(new Event('change', { bubbles: true }));
                        }, reg.value);
                        await new Promise((r) => setTimeout(r, 800));
                        await iterateTipoCrecheAndDownload(page, downloadPath, prefixReg);
                    });
                }
                return;
            }

            if (ag.value === 'E') {
                await page.waitForSelector(SELECTORS.selectEstado, { visible: true, timeout: 10000 });
                const estados = await getSelectOptions(page, SELECTORS.selectEstado);
                for (const est of estados) {
                    const prefixEst = `${prefixAg}_uf-${est.value}`;
                    await safeRunCombination(prefixEst, async () => {
                        log.info(`[${prefixEst}] Selecionando Estado: ${est.text}`);
                        await page.select(SELECTORS.selectEstado, est.value);
                        await page.evaluate((val) => {
                            const el = document.querySelector<HTMLSelectElement>('select#coUfIbge');
                            if (el) el.dispatchEvent(new Event('change', { bubbles: true }));
                        }, est.value);
                        await new Promise((r) => setTimeout(r, 800));
                        await iterateTipoCrecheAndDownload(page, downloadPath, prefixEst);
                    });
                }
                return;
            }

            if (ag.value === 'M') {
                await page.waitForSelector(SELECTORS.selectEstado, { visible: true, timeout: 10000 });
                const estados = await getSelectOptions(page, SELECTORS.selectEstado);
                for (const est of estados) {
                    if (est.value === 'TODOS' || est.value === '99') continue;
                    const prefixEst = `${prefixAg}_uf-${est.value}`;
                    await safeRunCombination(prefixEst, async () => {
                        log.info(`[${prefixEst}] Selecionando Estado para Municípios: ${est.text}`);
                        await page.select(SELECTORS.selectEstado, est.value);
                        await page.evaluate((val) => {
                            const el = document.querySelector<HTMLSelectElement>('select#coUfIbge');
                            if (el) el.dispatchEvent(new Event('change', { bubbles: true }));
                        }, est.value);

                        await page.waitForFunction(
                            (sel) => {
                                const el = document.querySelector<HTMLSelectElement>(sel);
                                return el && el.options.length > 1;
                            },
                            { timeout: 15000 },
                            SELECTORS.selectMunicipio
                        );
                        await new Promise((r) => setTimeout(r, 800));

                        const municipios = await getSelectOptions(page, SELECTORS.selectMunicipio);
                        for (const mun of municipios) {
                            const prefixMun = `${prefixEst}_mun-${mun.value}`;
                            await safeRunCombination(prefixMun, async () => {
                                log.info(`[${prefixMun}] Selecionando Município: ${mun.text}`);
                                await page.select(SELECTORS.selectMunicipio, mun.value);
                                await page.evaluate((val) => {
                                    const el = document.querySelector<HTMLSelectElement>('select#coMunicipioIbge');
                                    if (el) el.dispatchEvent(new Event('change', { bubbles: true }));
                                }, mun.value);
                                await new Promise((r) => setTimeout(r, 500));
                                await iterateTipoCrecheAndDownload(page, downloadPath, prefixMun);
                            });
                        }
                    });
                }
                return;
            }

            if (ag.value === 'D') {
                await page.waitForSelector(SELECTORS.selectDsei, { visible: true, timeout: 10000 });
                const dseis = await getSelectOptions(page, SELECTORS.selectDsei);
                for (const dsei of dseis) {
                    const prefixDsei = `${prefixAg}_dsei-${dsei.value}`;
                    await safeRunCombination(prefixDsei, async () => {
                        log.info(`[${prefixDsei}] Selecionando DSEI: ${dsei.text}`);
                        await page.select(SELECTORS.selectDsei, dsei.value);
                        await page.evaluate((val) => {
                            const el = document.querySelector<HTMLSelectElement>('select#coDSEI');
                            if (el) el.dispatchEvent(new Event('change', { bubbles: true }));
                        }, dsei.value);
                        await new Promise((r) => setTimeout(r, 500));
                        await iterateTipoCrecheAndDownload(page, downloadPath, prefixDsei);
                    });
                }
                return;
            }
        });
    }
}

async function selectCardReport(page: Page, tipoId: number, cardSelector: string): Promise<void> {
    const isShowTodosHidden = await page.evaluate(() => {
        const divFiltros = document.querySelector<HTMLElement>('div.box[ng-hide="showTodos"]');
        return !divFiltros || divFiltros.classList.contains('ng-hide');
    });

    if (isShowTodosHidden) {
        await page.waitForSelector(cardSelector, { visible: true, timeout: 10000 });
        await realClick(page, cardSelector);
    } else {
        const currentTipo = await page.$eval(
            'input#CO_TIPO_RELATORIO',
            (el) => (el as HTMLInputElement).value
        ).catch(() => null);

        if (currentTipo !== String(tipoId)) {
            const btnTrocar = await page.$(SELECTORS.btnTrocarRelatorio);
            if (btnTrocar) {
                await realClick(page, SELECTORS.btnTrocarRelatorio);
                await new Promise((r) => setTimeout(r, 800));
            }
            await page.waitForSelector(cardSelector, { visible: true, timeout: 10000 });
            await realClick(page, cardSelector);
        }
    }
}

async function executeReportFlow(
    page: Page,
    tipoId: number,
    tipoLabel: string,
    cardSelector: string,
    downloadPath: string,
    hasMes: boolean
): Promise<void> {
    const log = logger.forMethod('executeReportFlow');
    log.info(`Iniciando fluxo para o relatório: ${tipoLabel}`);

    await selectCardReport(page, tipoId, cardSelector);

    await page.waitForSelector(SELECTORS.selectAno, { visible: true, timeout: 15000 });
    await new Promise((r) => setTimeout(r, 1000));

    const anos = await getSelectOptions(page, SELECTORS.selectAno);

    for (const ano of anos) {
        const prefixAno = `${tipoLabel}_ano-${ano.value}`;
        await safeRunCombination(prefixAno, async () => {
            log.info(`[${prefixAno}] Selecionando Ano: ${ano.text}`);
            await page.select(SELECTORS.selectAno, ano.value);
            await page.evaluate((val) => {
                const el = document.querySelector<HTMLSelectElement>('select#nuAno');
                if (el) el.dispatchEvent(new Event('change', { bubbles: true }));
            }, ano.value);
            await new Promise((r) => setTimeout(r, 800));

            if (hasMes && (await page.$(SELECTORS.selectMes))) {
                await page.select(SELECTORS.selectMes, '99');
                await page.evaluate(() => {
                    const el = document.querySelector<HTMLSelectElement>('select#nuMes');
                    if (el) el.dispatchEvent(new Event('change', { bubbles: true }));
                });
                await new Promise((r) => setTimeout(r, 500));
            }

            await iterateGeoAndDownload(page, downloadPath, hasMes ? `${prefixAno}_mes-todos` : prefixAno);
        });
    }
}

async function scrapeModuloVitaminaA(page: Page, downloadRoot: string): Promise<void> {
    const log = logger.forMethod('scrapeModuloVitaminaA');
    const downloadPath = path.resolve(downloadRoot, 'vitamina-a');
    await setupDownloadBehavior(page, downloadPath);

    log.info('Acessando módulo Vitamina A...');
    await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2' }),
        realClick(page, SELECTORS.btnHomeVitaminaA)
    ]);

    await scrapeArquivosEstaticos(page, downloadPath, 'vitamina-a');
    await executeReportFlow(page, 1, 'quantitativo_suplementadas', SELECTORS.btnCardVitaminaSuplementadas, downloadPath, true);
    await executeReportFlow(page, 2, 'perda_capsulas', SELECTORS.btnCardVitaminaPerda, downloadPath, true);
}

async function scrapeModuloFerro(page: Page, downloadRoot: string): Promise<void> {
    const log = logger.forMethod('scrapeModuloFerro');
    const downloadPath = path.resolve(downloadRoot, 'ferro');
    await setupDownloadBehavior(page, downloadPath);

    log.info('Acessando módulo Ferro...');
    await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2' }),
        realClick(page, SELECTORS.btnHomeFerro)
    ]);

    await scrapeArquivosEstaticos(page, downloadPath, 'ferro');
    await executeReportFlow(page, 1, 'criancas_suplementadas_ferro', SELECTORS.btnCardFerroCrianca, downloadPath, false);
    await executeReportFlow(page, 2, 'gestantes_suplementadas_ferro', SELECTORS.btnCardFerroGestante, downloadPath, false);
    await executeReportFlow(page, 3, 'gestantes_suplementadas_acido_folico', SELECTORS.btnCardFerroAcidoFolico, downloadPath, false);
}

async function scrapeModuloNutriSus(page: Page, downloadRoot: string): Promise<void> {
    const log = logger.forMethod('scrapeModuloNutriSus');
    const downloadPath = path.resolve(downloadRoot, 'nutrisus');
    await setupDownloadBehavior(page, downloadPath);

    log.info('Acessando módulo NutriSus...');
    await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2' }),
        realClick(page, SELECTORS.btnHomeNutriSus)
    ]);

    await scrapeArquivosEstaticos(page, downloadPath, 'nutrisus');
    await executeReportFlow(page, 1, 'primeiro_ciclo_semestre', SELECTORS.btnCardNutriSusPrimeiroCiclo, downloadPath, false);
    await executeReportFlow(page, 2, 'segundo_ciclo_semestre', SELECTORS.btnCardNutriSusSegundoCiclo, downloadPath, false);
}

export async function scrapeMicronutrientes(page: Page, moduleName: string, targetUrl: string): Promise<void> {
    const log = logger.forMethod('scrapeMicronutrientes');
    const downloadRoot = path.resolve(process.cwd(), 'downloads', moduleName);

    log.info(`Navegando para o portal central de Micronutrientes: ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'networkidle2' });

    if (await page.$(SELECTORS.btnHomeVitaminaA)) {
        await scrapeModuloVitaminaA(page, downloadRoot);
        await page.goto(targetUrl, { waitUntil: 'networkidle2' });
    }

    if (await page.$(SELECTORS.btnHomeFerro)) {
        await scrapeModuloFerro(page, downloadRoot);
        await page.goto(targetUrl, { waitUntil: 'networkidle2' });
    }

    if (await page.$(SELECTORS.btnHomeNutriSus)) {
        await scrapeModuloNutriSus(page, downloadRoot);
        await page.goto(targetUrl, { waitUntil: 'networkidle2' });
    }

    log.info('Extração de todos os módulos de Micronutrientes finalizada com sucesso.');
}