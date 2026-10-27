// src/primeng_helpers.ts
import { Page } from "puppeteer";

/**
 * Retorna a quantidade de opções disponíveis no dropdown do PrimeNG.
 */
export async function getPrimeNgDropdownOptionsCount(page: Page, dropdownSelector: string): Promise<number> {
    await page.waitForSelector(dropdownSelector, { visible: true });

    await page.evaluate((sel) => {
        const trigger = document.querySelector<HTMLElement>(`${sel} .p-dropdown-trigger`) ||
            document.querySelector<HTMLElement>(`${sel} .p-dropdown`);
        trigger?.click();
    }, dropdownSelector);

    const panelSelector = 'body > .p-overlay .p-dropdown-panel, body > .p-dropdown-panel, .p-dropdown-panel';
    await page.waitForSelector(panelSelector, { visible: true, timeout: 15000 });

    const count = await page.evaluate((panelSel) => {
        const panels = Array.from(document.querySelectorAll<HTMLElement>(panelSel));
        const panel = panels.find((p) => p.offsetParent !== null) || panels[panels.length - 1];
        return panel ? panel.querySelectorAll('.p-dropdown-items .p-dropdown-item').length : 0;
    }, panelSelector);

    await page.keyboard.press('Escape');
    await page.waitForFunction(
        (sel) => {
            const panels = Array.from(document.querySelectorAll<HTMLElement>(sel));
            return panels.every((p) => p.offsetParent === null);
        },
        { timeout: 10000 },
        panelSelector
    ).catch(() => { });

    return count;
}

/**
 * Seleciona uma opção específica baseada no índice do dropdown PrimeNG.
 */
export async function selectPrimeNgDropdownOption(page: Page, dropdownSelector: string, index: number): Promise<void> {
    await page.waitForSelector(dropdownSelector, { visible: true });

    await page.evaluate((sel) => {
        const trigger = document.querySelector<HTMLElement>(`${sel} .p-dropdown-trigger`) ||
            document.querySelector<HTMLElement>(`${sel} .p-dropdown`);
        trigger?.click();
    }, dropdownSelector);

    const panelSelector = 'body > .p-overlay .p-dropdown-panel, body > .p-dropdown-panel, .p-dropdown-panel';
    await page.waitForSelector(panelSelector, { visible: true, timeout: 15000 });

    await page.evaluate((panelSel, itemIdx) => {
        const panels = Array.from(document.querySelectorAll<HTMLElement>(panelSel));
        const panel = panels.find((p) => p.offsetParent !== null) || panels[panels.length - 1];
        const items = panel ? Array.from(panel.querySelectorAll<HTMLElement>('.p-dropdown-items .p-dropdown-item')) : [];
        const target = items[itemIdx];
        if (target) {
            target.click();
        }
    }, panelSelector, index);

    await page.waitForFunction(
        (sel) => {
            const panels = Array.from(document.querySelectorAll<HTMLElement>(sel));
            return panels.every((p) => p.offsetParent === null);
        },
        { timeout: 10000 },
        panelSelector
    ).catch(() => { });
}

/**
 * Seleciona um radio button do PrimeNG pelo id do input ou label correspondente.
 */
export async function selectPrimeNgRadioButton(page: Page, inputId: string): Promise<void> {
    const radioSelector = `p-radiobutton[inputid="${inputId}"] .p-radiobutton-box, label[for="${inputId}"]`;
    await page.waitForSelector(radioSelector, { visible: true });
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
        await page.waitForSelector(`${tabSelector} .p-toggleable-content[aria-hidden="false"]`, { visible: true });
    }
}