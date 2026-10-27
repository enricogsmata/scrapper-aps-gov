// src/scrapers/siaps_publico.ts
import { Page } from "puppeteer";
import * as path from "path";
import { new_logger } from "../services/logs.js";
import { getPrimeNgDropdownOptionsCount, selectPrimeNgDropdownOption } from "../primeng_helpers.js";
import { setupDownloadBehavior, getFilesInDir, waitForNewDownloadAndRename } from "../downloader.js";

const logger = new_logger(import.meta.url);

// src/scrapers/siaps_publico.ts
const SELECTORS = {
    componenteDropdown: '.component-select p-dropdown',
    competenciaButton: 'button.select-competencia',
    competenciaOverlay: 'p-overlaypanel.ng-tns-c2421636214-4, p-overlaypanel:has(.competencia-title)',
    ufMultiselect: 'f-uf-select p-multiselect',
    btnAplicarFiltros: '.filter-row button.br-button.primary',
    downloadButton: 'download-button button.br-button',
    overlayCsvOption: '.p-overlaypanel .button-row'
};

async function getAvailableYears(page: Page): Promise<number[]> {
    await page.waitForSelector(SELECTORS.competenciaButton, { visible: true });
    await page.click(SELECTORS.competenciaButton);

    const overlaySelector = 'div.p-overlaypanel[role="dialog"]';
    await page.waitForSelector(overlaySelector, { visible: true, timeout: 10000 });

    const yearIndices = await page.evaluate(() => {
        const tabs = document.querySelectorAll<HTMLElement>('.p-overlaypanel accordion .accordion-header');
        return Array.from(tabs).map((_, i) => i);
    });

    await page.evaluate(() => {
        const cancelBtn = Array.from(
            document.querySelectorAll<HTMLButtonElement>('div.p-overlaypanel button.br-button.secondary')
        ).find((b) => b.textContent?.trim().toUpperCase() === 'CANCELAR');
        cancelBtn?.click();
    });

    await page.waitForSelector(overlaySelector, { hidden: true, timeout: 10000 });
    return yearIndices;
}

async function configureCompetenciasPorAno(page: Page, yearIndex: number): Promise<string> {
    await page.waitForSelector(SELECTORS.competenciaButton, { visible: true });
    await page.click(SELECTORS.competenciaButton);

    const overlaySelector = 'div.p-overlaypanel[role="dialog"]';
    await page.waitForSelector(overlaySelector, { visible: true, timeout: 10000 });

    const selectedLabel = await page.evaluate((tabIdx) => {
        const headers = document.querySelectorAll<HTMLElement>('.p-overlaypanel accordion .accordion-header');
        headers[tabIdx]?.click();

        const activeHeader = headers[tabIdx];
        const yearText = activeHeader?.querySelector('.accordion-header-text')?.textContent?.trim() || `ano-${tabIdx}`;

        const allCheckboxes = document.querySelectorAll<HTMLDivElement>(
            '.p-overlaypanel .content.quadrimestre .check-tile p-checkbox'
        );
        allCheckboxes.forEach((cb) => {
            const box = cb.querySelector('.p-checkbox-box');
            if (box && box.classList.contains('p-highlight')) {
                cb.click();
            }
        });

        const availableCbs = Array.from(
            document.querySelectorAll<HTMLDivElement>(
                '.p-overlaypanel .content.quadrimestre .check-tile:not(.disabled) p-checkbox'
            )
        ).slice(0, 3);

        availableCbs.forEach((cb) => {
            const box = cb.querySelector('.p-checkbox-box');
            if (box && !box.classList.contains('p-highlight')) {
                cb.click();
            }
        });

        return yearText;
    }, yearIndex);

    await new Promise((r) => setTimeout(r, 500));

    await page.evaluate(() => {
        const okBtn = Array.from(
            document.querySelectorAll<HTMLButtonElement>('div.p-overlaypanel button.br-button.primary')
        ).find((btn) => btn.textContent?.trim().toUpperCase() === 'OK');
        okBtn?.click();
    });

    await page.waitForSelector(overlaySelector, { hidden: true, timeout: 10000 });
    return selectedLabel;
}

async function selectAllUfs(page: Page): Promise<void> {
    await page.waitForSelector(`${SELECTORS.ufMultiselect} .p-multiselect-trigger`, { visible: true });
    await page.click(`${SELECTORS.ufMultiselect} .p-multiselect-trigger`);

    const headerCheckboxSelector = '.p-multiselect-panel .p-multiselect-header .p-checkbox';
    const fallbackItemSelector = '.p-multiselect-panel .p-multiselect-item';

    const hasHeaderCheckbox = await page
        .waitForSelector(headerCheckboxSelector, { visible: true, timeout: 5000 })
        .then(() => true)
        .catch(() => false);

    if (hasHeaderCheckbox) {
        await page.evaluate((sel) => {
            const checkbox = document.querySelector<HTMLInputElement>(`${sel} input[type="checkbox"]`);
            if (checkbox && !checkbox.checked) {
                checkbox.click();
            }
        }, headerCheckboxSelector);
    } else {
        await page.waitForSelector(fallbackItemSelector, { visible: true });
        await page.evaluate((sel) => {
            const items = document.querySelectorAll<HTMLElement>(sel);
            items.forEach((item) => {
                const box = item.querySelector('.p-checkbox-box');
                if (box && !box.classList.contains('p-highlight')) {
                    item.click();
                }
            });
        }, fallbackItemSelector);
    }

    await page.keyboard.press('Escape');
    await page.waitForSelector('.p-multiselect-panel', { hidden: true });
}

async function doDownloadCsv(page: Page, downloadPath: string, filePrefix: string): Promise<void> {
    const log = logger.forMethod('doDownloadCsv');
    const filesBefore = getFilesInDir(downloadPath);

    log.info(`[${filePrefix}] Disparando geração e download do relatório...`);

    const downloadButtonSelector = 'download-button button';
    await page.waitForSelector(downloadButtonSelector, { visible: true });

    await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
    });
    await new Promise((r) => setTimeout(r, 1000));

    await page.evaluate((sel) => {
        const btn = document.querySelector<HTMLButtonElement>(sel);
        btn?.scrollIntoView({ behavior: 'instant', block: 'center' });
        btn?.click();
    }, downloadButtonSelector);

    const overlayOptionSelector = 'div.button-row';
    await page.waitForSelector(overlayOptionSelector, { visible: true, timeout: 15000 });

    await page.evaluate((sel) => {
        const rows = Array.from(document.querySelectorAll<HTMLDivElement>(sel));
        const csvBtn = rows.find((r) => r.textContent?.toLowerCase().includes('.csv'));
        if (csvBtn) {
            csvBtn.click();
        } else {
            rows[0]?.click();
        }
    }, overlayOptionSelector);

    try {
        await waitForNewDownloadAndRename(downloadPath, filesBefore, filePrefix, 120000);
        log.info(`[${filePrefix}] Download do relatório CSV concluído com sucesso.`);
    } catch (error) {
        log.error({ data: JSON.stringify(error, null, 4) }, `[${filePrefix}] Falha no download CSV:`);
    }
}

export async function scrapeSiapsPublico(page: Page, moduleName: string, targetUrl: string): Promise<void> {
    const log = logger.forMethod('scrapeSiapsPublico');

    const urlObj = new URL(targetUrl);
    const treatedLinkName = urlObj.pathname.split('/').filter(Boolean).join('-').toLowerCase() || 'siaps-publico';
    const downloadPath = path.resolve(process.cwd(), 'downloads', moduleName, treatedLinkName);

    await setupDownloadBehavior(page, downloadPath);

    log.info(`Navegando para ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'networkidle2' });

    await page.waitForSelector(SELECTORS.componenteDropdown, { visible: true });
    const numComponentes = await getPrimeNgDropdownOptionsCount(page, SELECTORS.componenteDropdown);
    const yearIndices = await getAvailableYears(page);

    for (let c = 0; c < numComponentes; c++) {
        await selectPrimeNgDropdownOption(page, SELECTORS.componenteDropdown, c);
        await new Promise((r) => setTimeout(r, 1000));

        await selectAllUfs(page);
        await new Promise((r) => setTimeout(r, 1000));

        for (const yearIdx of yearIndices) {
            const yearLabel = await configureCompetenciasPorAno(page, yearIdx);
            await new Promise((r) => setTimeout(r, 1000));

            await page.click(SELECTORS.btnAplicarFiltros);
            await new Promise((r) => setTimeout(r, 3000));

            await doDownloadCsv(page, downloadPath, `comp-${c}_ano-${yearLabel}`);
        }
    }

    log.info('Extração finalizada para: Relatórios Públicos SIAPS.');
}