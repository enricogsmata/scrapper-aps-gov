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