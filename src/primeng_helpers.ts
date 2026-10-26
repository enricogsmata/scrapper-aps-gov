// src/primeng_helpers.ts
import { Page } from "puppeteer";

/**
 * Retorna a quantidade de opções disponíveis no dropdown do PrimeNG.
 */
export async function getPrimeNgDropdownOptionsCount(page: Page, dropdownSelector: string): Promise<number> {
    await page.waitForSelector(`${dropdownSelector} .p-dropdown-trigger`, { visible: true });
    await page.click(`${dropdownSelector} .p-dropdown-trigger`);
    
    await page.waitForSelector('.p-dropdown-items .p-dropdown-item', { visible: true });
    const options = await page.$$('.p-dropdown-items .p-dropdown-item');
    
    // Fecha o dropdown pressionando ESC
    await page.keyboard.press('Escape');
    await page.waitForSelector('.p-dropdown-items', { hidden: true });
    
    return options.length;
}

/**
 * Seleciona uma opção específica baseada no índice do dropdown PrimeNG.
 */
export async function selectPrimeNgDropdownOption(page: Page, dropdownSelector: string, index: number): Promise<void> {
    await page.waitForSelector(`${dropdownSelector} .p-dropdown-trigger`, { visible: true });
    await page.click(`${dropdownSelector} .p-dropdown-trigger`);
    
    await page.waitForSelector('.p-dropdown-items .p-dropdown-item', { visible: true });
    const options = await page.$$('.p-dropdown-items .p-dropdown-item');
    
    if (options[index]) {
        await options[index].click();
        await page.waitForSelector('.p-dropdown-items', { hidden: true });
    } else {
        throw new Error(`Opção no índice ${index} não encontrada no PrimeNG dropdown.`);
    }
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