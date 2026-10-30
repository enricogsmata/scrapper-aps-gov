// src\pipeline_bronze\scrapers\pagamento_mais_medicos.ts
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
    selectCompetencia: 'select[name="NU_COMPETENCIA"]',
    tabelaWrapper: '#dtTable_wrapper',
    btnExportExcel: 'button.buttons-excel'
};

async function getSelectOptions(page: Page, selector: string): Promise<Array<{ value: string; text: string }>> {
    return page.$$eval(`${selector} option`, (options) =>
        options
            .map((opt) => ({
                value: (opt as HTMLOptionElement).value,
                text: (opt as HTMLOptionElement).textContent?.trim() || ""
            }))
            .filter((opt) => opt.value !== "" && !opt.value.includes("?") && !opt.text.includes("- SELECIONE -"))
    );
}

export async function scrapePagamentoMaisMedicos(page: Page, moduleName: string, targetUrl: string): Promise<void> {
    const log = logger.forMethod('scrapePagamentoMaisMedicos');
    const downloadPath = path.resolve(process.cwd(), 'downloads', moduleName, 'profissionais-cadastrados');

    await setupDownloadBehavior(page, downloadPath);

    log.info(`Navegando para o relatório de Pagamento Mais Médicos: ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'networkidle2' });

    await page.waitForSelector(SELECTORS.selectCompetencia, { timeout: 30000 });

    const competencias = await getSelectOptions(page, SELECTORS.selectCompetencia);
    log.info(`Encontradas ${competencias.length} competências para extração.`);

    for (const comp of competencias) {
        const filePrefix = `competencia-${comp.value}`;

        await safeRunCombination(filePrefix, async () => {
            log.info(`[${filePrefix}] Selecionando competência: ${comp.text}`);
            await page.select(SELECTORS.selectCompetencia, comp.value);
            await page.evaluate((val) => {
                const el = document.querySelector<HTMLSelectElement>('select[name="NU_COMPETENCIA"]');
                if (el) el.dispatchEvent(new Event('change', { bubbles: true }));
            }, comp.value);

            await page.waitForSelector(SELECTORS.btnExportExcel, { timeout: 60000 });
            await new Promise((r) => setTimeout(r, 1000));

            await triggerDownloadAndSave(page, {
                downloadPath,
                fileName: filePrefix,
                trigger: async () => {
                    await realClick(page, SELECTORS.btnExportExcel);
                },
                startTimeout: 60000,
                finishTimeout: 300000,
                retries: 2,
                retryDelayMs: 3000
            });

            log.info(`[${filePrefix}] Planilha da competência baixada com sucesso.`);
        });
    }

    log.info('Extração finalizada com sucesso para Pagamento Mais Médicos.');
}