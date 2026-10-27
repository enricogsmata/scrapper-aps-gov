// src/scrapers/praticas_assistenciais.ts
import { Page } from "puppeteer";
import * as path from "path";
import { new_logger } from "../services/logs.js";
import { setupDownloadBehavior, getFilesInDir, waitForNewDownloadAndRename } from "../downloader.js";

const logger = new_logger(import.meta.url);

const SELECTORS = {
    tabPanelAtendimentos: 'p-tabpanel:has(#pn_id_3_content)',
    parametroRadioButtons: '.radio-cards button.radio-card',
    competenciaButton: 'f-competencia-select button.select-competencia',
    agruparPorDropdown: '.campo:has(label:contains("Agrupar por")) p-dropdown, div.campo:nth-child(2) p-dropdown',
    compararComDropdown: '.campo:has(label:contains("Comparar com")) p-dropdown, div.campo:nth-child(3) p-dropdown',
    btnRealizarConsulta: 'botao-realizar-consulta button.br-button.primary',
    btnDownload: 'download-button button.br-button',
    overlayCsvOption: '.p-overlaypanel div.button-row'
};

async function selectParametro(page: Page, index: number): Promise<string> {
    await page.waitForSelector(SELECTORS.parametroRadioButtons, { visible: true });
    return page.evaluate((sel, idx) => {
        const buttons = document.querySelectorAll<HTMLButtonElement>(sel);
        const target = buttons[idx];
        if (target) {
            target.click();
            const label = target.querySelector('.radio-label')?.textContent?.trim() || `param-${idx}`;
            return label
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-zA-Z0-9_-]/g, '_')
                .replace(/_+/g, '_')
                .toLowerCase();
        }
        return `param-${idx}`;
    }, SELECTORS.parametroRadioButtons, index);
}

async function getAvailableYears(page: Page): Promise<number[]> {
    await page.waitForSelector(SELECTORS.competenciaButton, { visible: true });
    await page.click(SELECTORS.competenciaButton);

    const overlaySelector = 'div.p-overlaypanel[role="dialog"]';
    await page.waitForSelector(overlaySelector, { visible: true, timeout: 10000 });

    const totalYears = await page.evaluate(() => {
        const headers = document.querySelectorAll<HTMLElement>(
            'div.p-overlaypanel .accordion-body .a-list-scroll a.accordion-header'
        );
        return headers.length;
    });

    await page.evaluate(() => {
        const cancelBtn = Array.from(
            document.querySelectorAll<HTMLButtonElement>('div.p-overlaypanel button.br-button.secondary')
        ).find((btn) => btn.textContent?.trim().toUpperCase() === 'CANCELAR');
        cancelBtn?.click();
    });

    await page.waitForSelector(overlaySelector, { hidden: true, timeout: 10000 });
    return Array.from({ length: totalYears }, (_, i) => i);
}

async function configureCompetenciasPorAno(page: Page, yearIndex: number): Promise<string> {
    await page.waitForSelector(SELECTORS.competenciaButton, { visible: true });
    await page.click(SELECTORS.competenciaButton);

    const overlaySelector = 'div.p-overlaypanel[role="dialog"]';
    await page.waitForSelector(overlaySelector, { visible: true, timeout: 10000 });

    const yearLabel = await page.evaluate((idx) => {
        const headers = document.querySelectorAll<HTMLElement>(
            'div.p-overlaypanel .accordion-body .a-list-scroll a.accordion-header'
        );
        headers[idx]?.scrollIntoView({ behavior: 'instant', inline: 'center' });
        headers[idx]?.click();

        const yearText = headers[idx]?.querySelector('.accordion-header-text')?.textContent?.trim() || `ano-${idx}`;

        const activePanel = document.querySelector<HTMLDivElement>(
            'div.p-overlaypanel .accordion-container.active'
        );

        if (activePanel) {
            const checkboxes = activePanel.querySelectorAll<HTMLDivElement>(
                '.content .check-tile:not(.disabled) p-checkbox'
            );
            checkboxes.forEach((cb) => {
                const box = cb.querySelector('.p-checkbox-box');
                if (box && !box.classList.contains('p-highlight')) {
                    const input = cb.querySelector<HTMLInputElement>('input[type="checkbox"]');
                    if (input) {
                        input.click();
                    } else {
                        cb.click();
                    }
                }
            });
        }

        return yearText;
    }, yearIndex);

    await new Promise((r) => setTimeout(r, 600));

    await page.evaluate(() => {
        const okBtn = Array.from(
            document.querySelectorAll<HTMLButtonElement>('div.p-overlaypanel button.br-button.primary')
        ).find((btn) => btn.textContent?.trim().toUpperCase() === 'OK');
        okBtn?.click();
    });

    await page.waitForSelector(overlaySelector, { hidden: true, timeout: 10000 });
    return yearLabel;
}

async function selectPrimeNgOptionByIndex(page: Page, dropdownContainerSelector: string, index: number): Promise<string> {
    await page.waitForSelector(dropdownContainerSelector, { visible: true });
    await page.click(`${dropdownContainerSelector} .p-dropdown-trigger, ${dropdownContainerSelector} .p-dropdown`);

    const panelSelector = 'div.painel-dimensao-praticas.p-dropdown-panel, .p-overlay .p-dropdown-panel, .p-dropdown-panel';
    await page.waitForSelector(panelSelector, { visible: true, timeout: 15000 });

    const selectedText = await page.evaluate((panelSel, itemIdx) => {
        const panels = Array.from(document.querySelectorAll<HTMLElement>(panelSel));
        const panel = panels.find((p) => p.offsetParent !== null) || panels[panels.length - 1];
        const items = panel ? Array.from(panel.querySelectorAll<HTMLElement>('.p-dropdown-items .p-dropdown-item')) : [];
        const target = items[itemIdx];
        if (target) {
            target.click();
            return target.textContent?.trim() || `opt-${itemIdx}`;
        }
        return '';
    }, panelSelector, index);

    await page.waitForFunction(
        (panelSel) => {
            const panels = Array.from(document.querySelectorAll<HTMLElement>(panelSel));
            return panels.every((p) => p.offsetParent === null);
        },
        { timeout: 10000 },
        panelSelector
    ).catch(() => {});

    return selectedText;
}

async function getDropdownOptionsCount(page: Page, dropdownContainerSelector: string): Promise<number> {
    await page.waitForSelector(dropdownContainerSelector, { visible: true });
    await page.click(`${dropdownContainerSelector} .p-dropdown-trigger, ${dropdownContainerSelector} .p-dropdown`);

    const panelSelector = 'div.painel-dimensao-praticas.p-dropdown-panel, .p-overlay .p-dropdown-panel, .p-dropdown-panel';
    await page.waitForSelector(panelSelector, { visible: true, timeout: 15000 });

    const count = await page.evaluate((panelSel) => {
        const panels = Array.from(document.querySelectorAll<HTMLElement>(panelSel));
        const panel = panels.find((p) => p.offsetParent !== null) || panels[panels.length - 1];
        return panel ? panel.querySelectorAll('.p-dropdown-items .p-dropdown-item').length : 0;
    }, panelSelector);

    await page.keyboard.press('Escape');
    await page.waitForFunction(
        (panelSel) => {
            const panels = Array.from(document.querySelectorAll<HTMLElement>(panelSel));
            return panels.every((p) => p.offsetParent === null);
        },
        { timeout: 10000 },
        panelSelector
    ).catch(() => {});

    return count;
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
        await waitForNewDownloadAndRename(downloadPath, filesBefore, filePrefix, 180000);
        log.info(`[${filePrefix}] Download do relatório CSV concluído com sucesso.`);
    } catch (error) {
        log.error({ data: JSON.stringify(error, null, 4) }, `[${filePrefix}] Falha no download CSV:`);
    }
}

export async function scrapePraticasAssistenciais(page: Page, moduleName: string, targetUrl: string): Promise<void> {
    const log = logger.forMethod('scrapePraticasAssistenciais');

    const urlObj = new URL(targetUrl);
    const treatedLinkName = urlObj.pathname.split('/').filter(Boolean).join('-').toLowerCase() || 'praticas-assistenciais';
    const basePath = path.resolve(process.cwd(), 'downloads', moduleName, treatedLinkName);

    await setupDownloadBehavior(page, basePath);

    log.info(`Navegando para ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'networkidle2' });

    await page.waitForSelector('p-tabview ul.p-tabview-nav', { visible: true });

    const totalTabs = await page.$$eval('p-tabview ul.p-tabview-nav li[role="presentation"] a', (els) => els.length);

    for (let t = 0; t < totalTabs; t++) {
        const tabInfo = await page.evaluate((tabIdx) => {
            const tabs = document.querySelectorAll<HTMLAnchorElement>('p-tabview ul.p-tabview-nav li[role="presentation"] a');
            const target = tabs[tabIdx];
            target?.click();
            const text = target?.textContent?.trim() || `tab-${tabIdx}`;
            const slug = text
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-zA-Z0-9_-]/g, '_')
                .replace(/_+/g, '_')
                .toLowerCase();
            return { text, slug };
        }, t);

        const tabDownloadPath = path.join(basePath, tabInfo.slug);
        await setupDownloadBehavior(page, tabDownloadPath);

        log.info(`Iniciando extração da aba [${tabInfo.text}]`);
        await page.waitForSelector('p-tabpanel:not([hidden]) div.campos-grid', { visible: true });

        const linhaDropdownSelector = 'p-tabpanel:not([hidden]) div.campos-grid > div:nth-child(2) p-dropdown';
        const colunaDropdownSelector = 'p-tabpanel:not([hidden]) div.campos-grid > div:nth-child(3) p-dropdown';
        const radioCardsSelector = 'p-tabpanel:not([hidden]) .radio-cards button.radio-card';

        const totalParametros = await page.$$eval(radioCardsSelector, (els) => els.length);
        const totalLinhaOptions = await getDropdownOptionsCount(page, linhaDropdownSelector);
        const totalColunaOptions = await getDropdownOptionsCount(page, colunaDropdownSelector);
        const availableYears = await getAvailableYears(page);

        for (let p = 0; p < totalParametros; p++) {
            const paramLabel = await page.evaluate((sel, idx) => {
                const buttons = document.querySelectorAll<HTMLButtonElement>(sel);
                const target = buttons[idx];
                target?.click();
                const label = target?.querySelector('.radio-label')?.textContent?.trim() || `param-${idx}`;
                return label
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
                    .replace(/[^a-zA-Z0-9_-]/g, '_')
                    .replace(/_+/g, '_')
                    .toLowerCase();
            }, radioCardsSelector, p);

            await new Promise((r) => setTimeout(r, 800));

            for (const yearIdx of availableYears) {
                const yearLabel = await configureCompetenciasPorAno(page, yearIdx);

                for (let l = 0; l < totalLinhaOptions; l++) {
                    const linhaLabel = await selectPrimeNgOptionByIndex(page, linhaDropdownSelector, l);

                    for (let c = 0; c < totalColunaOptions; c++) {
                        const colunaLabel = await selectPrimeNgOptionByIndex(page, colunaDropdownSelector, c);

                        log.info(`[${tabInfo.slug}] Consulta: [${paramLabel}] | Ano [${yearLabel}] | Linha [${linhaLabel}] | Coluna [${colunaLabel}]`);

                        const btnRealizarConsultaSel = 'p-tabpanel:not([hidden]) botao-realizar-consulta button.br-button.primary';
                        await page.waitForSelector(btnRealizarConsultaSel, { visible: true });
                        await page.click(btnRealizarConsultaSel);

                        const btnDownloadSel = 'p-tabpanel:not([hidden]) download-button button.br-button';
                        await page.waitForFunction(
                            (btnSel) => {
                                const btn = document.querySelector<HTMLButtonElement>(btnSel);
                                return btn && !btn.disabled;
                            },
                            { timeout: 180000 },
                            btnDownloadSel
                        );

                        const filePrefix = `${tabInfo.slug}_${paramLabel}_ano-${yearLabel}_l-${l}_c-${c}`;
                        await doDownloadCsv(page, tabDownloadPath, filePrefix);
                    }
                }
            }
        }
    }

    log.info('Extração finalizada para todas as abas de: Práticas Assistenciais.');
}