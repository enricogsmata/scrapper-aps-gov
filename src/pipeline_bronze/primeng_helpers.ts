// src/primeng_helpers.ts
import { Page } from "puppeteer";

/**
 * Aguarda spinners e loaders do PrimeNG ou do portal da saúde sumirem da tela.
 */
export async function waitForPrimeNgLoaders(page: Page, timeoutMs: number = 30000): Promise<void> {
    const loaderSelectors = [
        'app-loading .carregando',
        '.p-progress-spinner',
        '.p-blockui',
        '.loading-overlay',
        '.ngx-spinner-overlay'
    ];

    for (const sel of loaderSelectors) {
        try {
            await page.waitForFunction(
                (s) => {
                    const el = document.querySelector(s);
                    return !el || (el as HTMLElement).offsetParent === null;
                },
                { timeout: timeoutMs },
                sel
            );
        } catch {
            // Ignora timeout se o loader não estiver mais no DOM
        }
    }
}

/**
 * Verifica se um dropdown do PrimeNG está ativo e interativo (não desabilitado e visível).
 */
export async function isDropdownActive(page: Page, selector: string): Promise<boolean> {
    try {
        return await page.evaluate((sel) => {
            const el = document.querySelector(sel);
            if (!el) return false;
            const dropdown = el.querySelector('.p-dropdown') || el;
            if (!dropdown) return false;
            const isDisabled = dropdown.classList.contains('p-disabled') ||
                dropdown.getAttribute('aria-disabled') === 'true' ||
                el.hasAttribute('disabled');
            return !isDisabled && (dropdown as HTMLElement).offsetParent !== null;
        }, selector);
    } catch {
        return false;
    }
}

/**
 * Retorna a quantidade de opções disponíveis no dropdown do PrimeNG com tolerância a atrasos de rede.
 */
export async function getPrimeNgDropdownOptionsCount(
    page: Page,
    dropdownSelector: string,
    retries: number = 2
): Promise<number> {
    await waitForPrimeNgLoaders(page, 15000);

    for (let attempt = 1; attempt <= retries + 1; attempt++) {
        try {
            await page.waitForSelector(dropdownSelector, { visible: true, timeout: 15000 });

            // Garante que o elemento esteja visível antes do clique
            await page.evaluate((sel) => {
                const el = document.querySelector<HTMLElement>(sel);
                el?.scrollIntoView({ behavior: 'instant', block: 'center' });
            }, dropdownSelector);

            await new Promise((r) => setTimeout(r, 300));

            await page.evaluate((sel) => {
                const trigger = document.querySelector<HTMLElement>(`${sel} .p-dropdown-trigger`) ||
                    document.querySelector<HTMLElement>(`${sel} .p-dropdown`) ||
                    document.querySelector<HTMLElement>(sel);
                trigger?.click();
            }, dropdownSelector);

            const panelSelector = 'body > .p-overlay .p-dropdown-panel, body > .p-dropdown-panel, .p-dropdown-panel';
            await page.waitForSelector(panelSelector, { visible: true, timeout: 8000 });

            const count = await page.evaluate((panelSel) => {
                const panels = Array.from(document.querySelectorAll<HTMLElement>(panelSel));
                const panel = panels.find((p) => p.offsetParent !== null) || panels[panels.length - 1];
                return panel ? panel.querySelectorAll('.p-dropdown-items .p-dropdown-item').length : 0;
            }, panelSelector);

            // Fecha o painel
            await page.keyboard.press('Escape');
            await page.waitForFunction(
                (sel) => {
                    const panels = Array.from(document.querySelectorAll<HTMLElement>(sel));
                    return panels.every((p) => p.offsetParent === null);
                },
                { timeout: 5000 },
                panelSelector
            ).catch(() => { });

            return count;
        } catch {
            // Em caso de falha transitória, tenta fechar painéis abertos com Escape e aguarda antes da próxima tentativa
            await page.keyboard.press('Escape').catch(() => { });
            if (attempt <= retries) {
                await new Promise((r) => setTimeout(r, 1500 * attempt));
            }
        }
    }

    return 0;
}

/**
 * Seleciona uma opção específica baseada no índice do dropdown PrimeNG com retries e validação.
 */
export async function selectPrimeNgDropdownOption(
    page: Page,
    dropdownSelector: string,
    index: number,
    retries: number = 2
): Promise<void> {
    await waitForPrimeNgLoaders(page, 15000);

    for (let attempt = 1; attempt <= retries + 1; attempt++) {
        try {
            await page.waitForSelector(dropdownSelector, { visible: true, timeout: 15000 });

            await page.evaluate((sel) => {
                const el = document.querySelector<HTMLElement>(sel);
                el?.scrollIntoView({ behavior: 'instant', block: 'center' });
            }, dropdownSelector);

            await new Promise((r) => setTimeout(r, 300));

            await page.evaluate((sel) => {
                const trigger = document.querySelector<HTMLElement>(`${sel} .p-dropdown-trigger`) ||
                    document.querySelector<HTMLElement>(`${sel} .p-dropdown`) ||
                    document.querySelector<HTMLElement>(sel);
                trigger?.click();
            }, dropdownSelector);

            const panelSelector = 'body > .p-overlay .p-dropdown-panel, body > .p-dropdown-panel, .p-dropdown-panel';
            await page.waitForSelector(panelSelector, { visible: true, timeout: 10000 });

            const clicked = await page.evaluate((panelSel, itemIdx) => {
                const panels = Array.from(document.querySelectorAll<HTMLElement>(panelSel));
                const panel = panels.find((p) => p.offsetParent !== null) || panels[panels.length - 1];
                const items = panel ? Array.from(panel.querySelectorAll<HTMLElement>('.p-dropdown-items .p-dropdown-item')) : [];
                const target = items[itemIdx];
                if (target) {
                    target.scrollIntoView({ behavior: 'instant', block: 'nearest' });
                    target.click();
                    return true;
                }
                return false;
            }, panelSelector, index);

            if (!clicked) {
                throw new Error(`Opção no índice ${index} não encontrada no painel aberto.`);
            }

            await page.waitForFunction(
                (sel) => {
                    const panels = Array.from(document.querySelectorAll<HTMLElement>(sel));
                    return panels.every((p) => p.offsetParent === null);
                },
                { timeout: 8000 },
                panelSelector
            ).catch(() => { });

            // Aguarda processamento de bindings/AJAX
            await new Promise((r) => setTimeout(r, 600));
            await waitForPrimeNgLoaders(page, 15000);
            return;
        } catch (error) {
            await page.keyboard.press('Escape').catch(() => { });
            if (attempt <= retries) {
                await new Promise((r) => setTimeout(r, 1500 * attempt));
            } else {
                throw error;
            }
        }
    }
}

/**
 * Seleciona um radio button do PrimeNG pelo id do input ou label correspondente.
 */
export async function selectPrimeNgRadioButton(page: Page, inputId: string): Promise<void> {
    const radioSelector = `p-radiobutton[inputid="${inputId}"] .p-radiobutton-box, label[for="${inputId}"]`;
    await page.waitForSelector(radioSelector, { visible: true, timeout: 15000 });
    await page.evaluate((sel) => {
        document.querySelector<HTMLElement>(sel)?.scrollIntoView({ behavior: 'instant', block: 'center' });
    }, radioSelector);
    await new Promise((r) => setTimeout(r, 300));
    await page.click(radioSelector);
}

/**
 * Garante que uma aba de AccordionTab do PrimeNG esteja expandida.
 */
export async function ensurePrimeNgAccordionTabOpen(page: Page, tabSelector: string): Promise<void> {
    const isClosed = await page.evaluate((sel) => {
        const tab = document.querySelector(sel);
        if (!tab) return false;
        const innerTab = tab.querySelector('.p-accordion-tab');
        return innerTab ? !innerTab.classList.contains('p-accordion-tab-active') : false;
    }, tabSelector);

    if (isClosed) {
        await page.click(`${tabSelector} .p-accordion-header-link`);
        await page.waitForSelector(`${tabSelector} .p-toggleable-content[aria-hidden="false"]`, { visible: true, timeout: 15000 });
    }
}