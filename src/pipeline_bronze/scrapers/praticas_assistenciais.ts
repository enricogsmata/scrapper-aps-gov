// src/scrapers/praticas_assistenciais.ts
import { Page, HTTPResponse } from "puppeteer";
import * as path from "path";
import * as fs from "fs";
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
    tabPanelAtendimentos: 'p-tabpanel:has(#pn_id_3_content)',
    parametroRadioButtons: '.radio-cards button.radio-card',
    competenciaButton: 'div.p-tabview-panel:not([hidden]) f-competencia-select button.select-competencia',
    agruparPorDropdown: '.campo:has(label:contains("Agrupar por")) p-dropdown, div.campo:nth-child(2) p-dropdown',
    compararComDropdown: '.campo:has(label:contains("Comparar com")) p-dropdown, div.campo:nth-child(3) p-dropdown',
    btnRealizarConsulta: 'botao-realizar-consulta button.br-button.primary',
    btnDownload: 'download-button button.br-button',
    overlayCsvOption: '.p-overlaypanel div.button-row'
};

async function getAvailableYears(page: Page): Promise<number[]> {
    await page.waitForSelector(SELECTORS.competenciaButton, { visible: true });
    await realClick(page, SELECTORS.competenciaButton);

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

    await page.waitForSelector(overlaySelector, { hidden: true, timeout: 10000 }).catch(() => { });
    return Array.from({ length: totalYears }, (_, i) => i);
}

async function configureCompetenciasPorAno(page: Page, yearIndex: number): Promise<string> {
    await page.waitForSelector(SELECTORS.competenciaButton, { visible: true });
    await realClick(page, SELECTORS.competenciaButton);

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

    await page.waitForSelector(overlaySelector, { hidden: true, timeout: 10000 }).catch(() => { });
    return yearLabel;
}

async function selectPrimeNgOptionByIndex(page: Page, dropdownContainerSelector: string, index: number): Promise<string> {
    const loaderSelectors = [
        'app-loading .carregando',
        '.p-progress-spinner',
        '.p-blockui',
        '.loading-overlay',
        '.ngx-spinner-overlay',
        '.status-processando'
    ];
    for (const sel of loaderSelectors) {
        await page.waitForFunction(
            (s) => {
                const el = document.querySelector(s);
                return !el || (el as HTMLElement).offsetParent === null;
            },
            { timeout: 120000 },
            sel
        ).catch(() => { });
    }

    await page.waitForFunction(
        (sel) => {
            const dropdown = document.querySelector(`${sel} .p-dropdown`) || document.querySelector(sel);
            return dropdown && !dropdown.classList.contains('p-disabled') && !dropdown.hasAttribute('disabled');
        },
        { timeout: 30000 },
        dropdownContainerSelector
    ).catch(() => { });

    await page.waitForSelector(dropdownContainerSelector, { visible: true, timeout: 15000 });
    await page.evaluate((sel) => {
        document.querySelector<HTMLElement>(sel)?.scrollIntoView({ behavior: 'instant', block: 'center' });
    }, dropdownContainerSelector);
    await new Promise((r) => setTimeout(r, 400));

    const panelSelector = 'div.painel-dimensao-praticas.p-dropdown-panel, .p-overlay .p-dropdown-panel, .p-dropdown-panel';

    let opened = false;
    for (let attempt = 0; attempt < 3; attempt++) {
        await page.evaluate((sel) => {
            const trigger = document.querySelector<HTMLElement>(`${sel} .p-dropdown-trigger`) ||
                document.querySelector<HTMLElement>(`${sel} .p-dropdown`) ||
                document.querySelector<HTMLElement>(sel);
            trigger?.click();
        }, dropdownContainerSelector);

        try {
            await page.waitForSelector(panelSelector, { visible: true, timeout: 5000 });
            opened = true;
            break;
        } catch {
            await page.keyboard.press('Escape').catch(() => { });
            await new Promise((r) => setTimeout(r, 1000));
        }
    }

    if (!opened) {
        throw new Error(`Não foi possível abrir o dropdown: ${dropdownContainerSelector}`);
    }

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
    ).catch(() => { });

    await new Promise((r) => setTimeout(r, 500));
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
    ).catch(() => { });

    return count;
}

async function doDownloadCsv(page: Page, downloadPath: string, filePrefix: string): Promise<void> {
    const log = logger.forMethod('doDownloadCsv');
    log.info(`[${filePrefix}] Disparando download do relatório...`);

    const downloadButtonSelector = 'div.p-tabview-panel:not([hidden]) download-button button';
    const overlayOptionSelector = 'div.button-row';

    try {
        const savedPath = await triggerDownloadAndSave(page, {
            downloadPath,
            fileName: filePrefix,
            trigger: async () => {
                await page.waitForSelector(downloadButtonSelector, { visible: true });
                await realClick(page, downloadButtonSelector);
                await page.waitForSelector(overlayOptionSelector, { visible: true, timeout: 15000 });

                await page.evaluate((sel) => {
                    const rows = Array.from(document.querySelectorAll<HTMLDivElement>(sel));
                    const visibleRows = rows.filter((r) => r.offsetParent !== null);
                    const targetRows = visibleRows.length > 0 ? visibleRows : rows;
                    const csvBtn = targetRows.find((r) => r.textContent?.toLowerCase().includes('.csv'));
                    if (csvBtn) {
                        csvBtn.click();
                    } else {
                        targetRows[0]?.click();
                    }
                }, overlayOptionSelector);
            },
            startTimeout: 60000,
            finishTimeout: 360000,
            retries: 2,
            retryDelayMs: 3000,
        });
        log.info(`[${filePrefix}] Download do relatório CSV concluído com sucesso: ${savedPath}`);
    } catch (error) {
        log.error({ data: formatError(error) }, `[${filePrefix}] Falha no download CSV:`);
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

    for (let t = 4; t < totalTabs; t++) {
        const tabLinks = await page.$$('p-tabview ul.p-tabview-nav li[role="presentation"] a');
        await realClick(page, tabLinks[t]);

        const tabInfo = await page.evaluate((tabIdx) => {
            const tabs = document.querySelectorAll<HTMLAnchorElement>('p-tabview ul.p-tabview-nav li[role="presentation"] a');
            const target = tabs[tabIdx];
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
        await page.waitForSelector('div.p-tabview-panel:not([hidden]) div.campos-grid', { visible: true });

        const linhaDropdownSelector = 'div.p-tabview-panel:not([hidden]) div.campos-grid > div:nth-child(2) p-dropdown';
        const colunaDropdownSelector = 'div.p-tabview-panel:not([hidden]) div.campos-grid > div:nth-child(3) p-dropdown';
        const radioCardsSelector = 'div.p-tabview-panel:not([hidden]) .radio-cards button.radio-card';

        const totalParametros = await page.$$eval(radioCardsSelector, (els) => els.length);
        const totalLinhaOptions = await getDropdownOptionsCount(page, linhaDropdownSelector);
        const totalColunaOptions = await getDropdownOptionsCount(page, colunaDropdownSelector);
        const availableYears = await getAvailableYears(page);

        for (let p = 0; p < totalParametros; p++) {
            await safeRunCombination(`${tabInfo.slug}_param-${p}`, async () => {
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
                    await safeRunCombination(`${tabInfo.slug}_${paramLabel}_anoIdx-${yearIdx}`, async () => {
                        const yearLabel = await configureCompetenciasPorAno(page, yearIdx);

                        for (let l = 0; l < totalLinhaOptions; l++) {
                            await safeRunCombination(`${tabInfo.slug}_${paramLabel}_ano-${yearLabel}_l-${l}`, async () => {
                                const linhaLabel = await selectPrimeNgOptionByIndex(page, linhaDropdownSelector, l);

                                for (let c = 0; c < totalColunaOptions; c++) {
                                    await safeRunCombination(`${tabInfo.slug}_${paramLabel}_ano-${yearLabel}_l-${l}_c-${c}`, async () => {
                                        const colunaLabel = await selectPrimeNgOptionByIndex(page, colunaDropdownSelector, c);
                                        log.info(`[${tabInfo.slug}] Consulta: [${paramLabel}] | Ano [${yearLabel}] | Linha [${linhaLabel}] | Coluna [${colunaLabel}]`);

                                        const btnRealizarConsultaSel = 'div.p-tabview-panel:not([hidden]) botao-realizar-consulta button.br-button.primary';

                                        const isConsultaEnabled = await page.waitForFunction(
                                            (sel) => {
                                                const btn = document.querySelector<HTMLButtonElement>(sel);
                                                return btn && !btn.disabled && !btn.classList.contains('disabled');
                                            },
                                            { timeout: 10000 },
                                            btnRealizarConsultaSel
                                        ).then(() => true).catch(() => false);

                                        if (!isConsultaEnabled) {
                                            log.warn(`[${tabInfo.slug}] Botão "Realizar Consulta" desabilitado para ${paramLabel} | Linha: ${linhaLabel} | Coluna: ${colunaLabel}. Pulando.`);
                                            return;
                                        }

                                        const filePrefix = `${tabInfo.slug}_${paramLabel}_ano-${yearLabel}_l-${l}_c-${c}`;
                                        let jsonPayload: any = null;

                                        const captureResponse = async (res: HTTPResponse) => {
                                            if (res.url().includes('praticas-assistenciais/consulta') && res.request().method() === 'POST') {
                                                try { jsonPayload = await res.json(); } catch { }
                                            }
                                        };
                                        page.on('response', captureResponse);

                                        await realClick(page, btnRealizarConsultaSel);
                                        await new Promise((r) => setTimeout(r, 1000));

                                        const btnDownloadSel = 'div.p-tabview-panel:not([hidden]) download-button button.br-button';

                                        try {
                                            const consultResult = await page.waitForFunction(
                                                (btnSel) => {
                                                    const toastEls = Array.from(document.querySelectorAll(
                                                        '.p-toast-message, .p-message, .alert, .ui-messages, .message-error, .toast-body'
                                                    ));
                                                    const text = toastEls.map((el) => el.textContent || '').join(' ').toLowerCase();
                                                    if (/nenhum registro|não foram encontrados|sem dados|nenhum dado|dados não encontrados|não há dados/.test(text)) {
                                                        return 'NO_DATA';
                                                    }
                                                    if (/erro interno|falha na consulta|ocorreu um erro|exception/.test(text)) {
                                                        return 'ERROR';
                                                    }

                                                    const btn = document.querySelector<HTMLButtonElement>(btnSel);
                                                    if (btn && !btn.disabled && !btn.classList.contains('disabled')) {
                                                        return 'SUCCESS';
                                                    }
                                                    return false;
                                                },
                                                { timeout: 60000, polling: 1000 },
                                                btnDownloadSel
                                            );

                                            const status = await consultResult.jsonValue();
                                            if (status === 'NO_DATA') {
                                                throw new Error(`[NO_DATA] Sem dados para ${paramLabel} | Ano: ${yearLabel} | Linha: ${linhaLabel} | Coluna: ${colunaLabel}`);
                                            }
                                            if (status === 'ERROR') {
                                                throw new Error(`Erro retornado pelo portal para ${paramLabel} | Ano: ${yearLabel} | Linha: ${linhaLabel} | Coluna: ${colunaLabel}`);
                                            }

                                            await doDownloadCsv(page, tabDownloadPath, filePrefix);

                                            const expectedCsvPath = path.join(tabDownloadPath, `${filePrefix}.csv`);
                                            if (!fs.existsSync(expectedCsvPath)) {
                                                throw new Error(`Falha no download CSV. Arquivo não encontrado.`);
                                            }
                                        } catch (err: any) {
                                            if (err.message && err.message.includes('[NO_DATA]')) {
                                                throw err;
                                            }

                                            if (jsonPayload) {
                                                log.warn(`[${filePrefix}] Falha na interface/download. Ativando fallback: salvando JSON interceptado.`);
                                                const jsonPath = path.join(tabDownloadPath, `${filePrefix}.json`);
                                                fs.writeFileSync(jsonPath, JSON.stringify(jsonPayload, null, 2));
                                            } else {
                                                throw err;
                                            }
                                        } finally {
                                            page.off('response', captureResponse);
                                        }
                                    });
                                }
                            });
                        }
                    });
                }
            });
        }
    }

    log.info('Extração finalizada para todas as abas de: Práticas Assistenciais.');
}