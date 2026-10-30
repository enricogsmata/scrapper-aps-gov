// src/scrapers/relatorio_consolidado_bfa.ts
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
    btnConsolidados: 'a[href="https://bfa.saude.gov.br/relatorio/consolidado"], a.showSingle',
    selectPublico: 'select#filtroPublicoVisualizar',
    radioOpConsultaPorVigencia: 'input[name="opDeConsulta"][value="unidadesgeograficasporvigencia"]',
    selectVigencia: 'select#filtroVigencia',
    radioUnidBrasil: 'input[name="opUnidGeografica"][value="brasil"]',
    radioUnidRegiao: 'input[name="opUnidGeografica"][value="regiao"]',
    radioUnidEstado: 'input[name="opUnidGeografica"][value="estado"]',
    radioUnidMunicipios: 'input[name="opUnidGeografica"][value="municipios"]',
    selectRegiao: 'select#filtroRegiao',
    selectEstado: 'select[name="filtroEstado"]',
    radioFiltroEspecifico: 'input[name="tpFiltroEspecifico"]',
    btnGerar: 'button#gerarrelatorio',
    btnExportExcel: 'button.buttons-excel',
    datatableWrapper: '#datatable_wrapper'
};

const FILTROS_ESPECIFICOS = [
    'consolidadocondicionalidadesdesaude',
    'consolidadomotdescumprimento',
    'consolidadoinformacoesesus'
];

async function getSelectOptions(page: Page, selector: string): Promise<Array<{ value: string; text: string }>> {
    return page.$$eval(`${selector} option`, (options) =>
        options
            .map((opt) => ({
                value: (opt as HTMLOptionElement).value,
                text: (opt as HTMLOptionElement).textContent?.trim() || ""
            }))
            .filter((opt) => opt.value !== "" && !opt.value.includes("?"))
    );
}

async function triggerReportDownload(page: Page, downloadPath: string, filePrefix: string): Promise<void> {
    const log = logger.forMethod('triggerReportDownload');

    try {
        await triggerDownloadAndSave(page, {
            downloadPath,
            fileName: filePrefix,
            trigger: async () => {
                await realClick(page, SELECTORS.btnGerar);
                try {
                    await page.waitForSelector(SELECTORS.btnExportExcel, { visible: true, timeout: 15000 });
                    await realClick(page, SELECTORS.btnExportExcel);
                } catch {
                    log.info(`[${filePrefix}] Download acionado diretamente pelo submit do formulário.`);
                }
            },
            startTimeout: 60000,
            finishTimeout: 300000,
            retries: 2,
            retryDelayMs: 3000
        });
        log.info(`[${filePrefix}] Relatório consolidado baixado com sucesso.`);
    } catch (error) {
        log.error({ data: formatError(error) }, `[${filePrefix}] Erro ao realizar download do consolidado:`);
    }
}

export async function scrapeRelatorioConsolidadoBfa(page: Page, moduleName: string, targetUrl: string): Promise<void> {
    const log = logger.forMethod('scrapeRelatorioConsolidadoBfa');

    const downloadPath = path.resolve(process.cwd(), 'downloads', moduleName, 'relatorio-consolidado');
    await setupDownloadBehavior(page, downloadPath);

    log.info(`Navegando para a página de relatórios: ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'networkidle2' });

    if (await page.$(SELECTORS.btnConsolidados)) {
        log.info('Clicando no botão de acesso aos Consolidados...');
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle2' }),
            realClick(page, SELECTORS.btnConsolidados)
        ]);
    }

    await page.waitForSelector(SELECTORS.selectPublico, { visible: true, timeout: 30000 });

    const publicos = await getSelectOptions(page, SELECTORS.selectPublico);

    for (const pub of publicos) {
        await safeRunCombination(`pub-${pub.value}`, async () => {
            log.info(`Selecionando público: ${pub.text} (${pub.value})`);
            await page.select(SELECTORS.selectPublico, pub.value);
            await new Promise((r) => setTimeout(r, 800));

            const isOpConsultaChecked = await page.$eval(
                SELECTORS.radioOpConsultaPorVigencia,
                (el) => (el as HTMLInputElement).checked
            );
            if (!isOpConsultaChecked) {
                await realClick(page, SELECTORS.radioOpConsultaPorVigencia);
                await new Promise((r) => setTimeout(r, 500));
            }

            const vigencias = await getSelectOptions(page, SELECTORS.selectVigencia);

            for (const vig of vigencias) {
                const prefixVig = `pub-${pub.value}_vig-${vig.value}`;
                await safeRunCombination(prefixVig, async () => {
                    log.info(`[${prefixVig}] Selecionando vigência: ${vig.text}`);
                    await page.select(SELECTORS.selectVigencia, vig.value);
                    await new Promise((r) => setTimeout(r, 800));

                    log.info(`[${prefixVig}] Selecionando unidade geográfica: BRASIL`);
                    await realClick(page, SELECTORS.radioUnidBrasil);
                    await new Promise((r) => setTimeout(r, 500));

                    for (const filtro of FILTROS_ESPECIFICOS) {
                        const filePrefixBrasil = `${prefixVig}_unid-brasil_${filtro}`;
                        await safeRunCombination(filePrefixBrasil, async () => {
                            await realClick(page, `${SELECTORS.radioFiltroEspecifico}[value="${filtro}"]`);
                            await new Promise((r) => setTimeout(r, 500));
                            await triggerReportDownload(page, downloadPath, filePrefixBrasil);
                        });
                    }

                    log.info(`[${prefixVig}] Selecionando unidade geográfica: ESTADO`);
                    await realClick(page, SELECTORS.radioUnidEstado);
                    await page.waitForSelector(SELECTORS.selectRegiao, { visible: true, timeout: 15000 });
                    await new Promise((r) => setTimeout(r, 800));

                    const regioes = await getSelectOptions(page, SELECTORS.selectRegiao);

                    for (const reg of regioes) {
                        const prefixRegiao = `${prefixVig}_reg-${reg.value}`;
                        await safeRunCombination(prefixRegiao, async () => {
                            log.info(`[${prefixRegiao}] Selecionando Região: ${reg.text} (${reg.value})`);
                            await page.select(SELECTORS.selectRegiao, reg.value);
                            await page.waitForFunction(
                                (sel) => {
                                    const select = document.querySelector<HTMLSelectElement>(sel);
                                    return select && select.options.length > 1;
                                },
                                { timeout: 15000 },
                                SELECTORS.selectEstado
                            );
                            await new Promise((r) => setTimeout(r, 800));

                            const estados = await getSelectOptions(page, SELECTORS.selectEstado);

                            for (const est of estados) {
                                const prefixEstado = `${prefixRegiao}_uf-${est.text}`;
                                await safeRunCombination(prefixEstado, async () => {
                                    log.info(`[${prefixEstado}] Selecionando Estado: ${est.text}`);
                                    await page.select(SELECTORS.selectEstado, est.value);
                                    await new Promise((r) => setTimeout(r, 800));

                                    for (const filtro of FILTROS_ESPECIFICOS) {
                                        const filePrefixUf = `${prefixEstado}_${filtro}`;
                                        await safeRunCombination(filePrefixUf, async () => {
                                            await realClick(page, `${SELECTORS.radioFiltroEspecifico}[value="${filtro}"]`);
                                            await new Promise((r) => setTimeout(r, 500));
                                            await triggerReportDownload(page, downloadPath, filePrefixUf);
                                        });
                                    }
                                });
                            }
                        });
                    }
                });
            }
        });
    }

    log.info('Extração finalizada com sucesso para BFA Relatórios Consolidados.');
}