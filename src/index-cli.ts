import puppeteer, { Browser, Page } from "puppeteer";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import fs from "fs";
import path from "path";
import { MAIN_URL } from "./config.js";
import { new_logger } from "./services/logs.js";

/**
 * CLI interativa para testes do scrapper.
 *
 * Fluxo 1 (padrão): scraping da main page + todos os módulos.
 * Fluxo 2 (interativo): scraping completo da main page; depois o usuário escolhe
 *   - rodar apenas um módulo (pelo índice) ou todos a partir de um índice;
 *   - baixar apenas 1 arquivo (primeira combinação de filtros) ou todos os arquivos.
 *
 * Obs.: este arquivo é autocontido porque o arquivo original executa
 * `await runScrapper()` no nível do módulo (importá-lo dispararia o scraping).
 */

interface ScrapedModules {
    module: string,
    links: string[],
}

interface RunOptions {
    /** true = baixa só o arquivo da primeira combinação de filtros de cada página e para */
    singleFile: boolean,
}

const logger = new_logger(import.meta.url);
const HEADLESS = process.env.HEADLESS !== 'false';

// ---------------------------------------------------------------------------
// Scraping da main page
// ---------------------------------------------------------------------------

async function mainPageScrapper(page: Page): Promise<ScrapedModules[]> {
    const log = logger.forMethod('mainPageScrapper');

    const cssSelectorButtons: string = "button.botao-modulo";
    const cssSelectorMenuItems: string = "div.item-menu";

    log.info('Iniciando extração de dados da página principal...');
    await page.goto(MAIN_URL.toString());

    await page.waitForSelector(cssSelectorButtons, { visible: true });

    const totalButtons: number = await page.$$eval(cssSelectorButtons,
        (elements) => elements.length
    );

    const modules: ScrapedModules[] = [];

    log.info('Percorrendo menus disponíveis...');
    for (let i = 0; i < totalButtons; i++) {
        const buttons = await page.$$(cssSelectorButtons);

        const moduleName: string = await page.evaluate(
            (el) => el.innerHTML.trim(),
            buttons[i]
        );

        await buttons[i].click();
        await page.waitForSelector(cssSelectorMenuItems);

        const menuItems = await page.$$eval(`${cssSelectorMenuItems} .ng-star-inserted`, (elements) => {
            return elements.map((element) => (element as HTMLAnchorElement).href)
                .filter(Boolean);
        });

        modules.push({
            module: moduleName,
            links: menuItems,
        });
    }

    log.info('Extração de dados da página principal concluída!');
    return modules;
}

// ---------------------------------------------------------------------------
// Helpers de dropdown (PrimeNG)
// ---------------------------------------------------------------------------

async function selectPrimeNgOption(page: Page, dropdownSelector: string, index: number): Promise<boolean> {
    await page.waitForSelector(dropdownSelector, { visible: true });
    await page.click(`${dropdownSelector} .p-dropdown-trigger`);

    const itemsSelector = '.p-dropdown-items .p-dropdown-item';
    await page.waitForSelector(itemsSelector, { visible: true });

    const options = await page.$$(itemsSelector);
    if (index >= options.length) {
        await page.keyboard.press('Escape');
        return false;
    }

    await options[index].click();
    // Tempo fixo de espera para garantir o carregamento em cascata do PrimeNG
    await new Promise(resolve => setTimeout(resolve, 1500));
    return true;
}

async function getDropdownOptionsCount(page: Page, dropdownSelector: string): Promise<number> {
    await page.waitForSelector(dropdownSelector, { visible: true });
    await page.click(`${dropdownSelector} .p-dropdown-trigger`);

    const itemsSelector = '.p-dropdown-items .p-dropdown-item';
    await page.waitForSelector(itemsSelector, { visible: true });

    const options = await page.$$(itemsSelector);
    const count = options.length;

    await page.keyboard.press('Escape');
    await new Promise(resolve => setTimeout(resolve, 500));
    return count;
}

// ---------------------------------------------------------------------------
// Download / extração do arquivo
// ---------------------------------------------------------------------------

/**
 * Retorna true se, ao final, existe um arquivo para o contexto
 * (baixado agora ou já existente). Retorna false em caso de falha/botões desabilitados.
 */
async function triggerDownloadAndSave(page: Page, moduleName: string, subModuleName: string, filterContext: number[], log: any): Promise<boolean> {
    const safeModuleName = moduleName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    const safeSubModuleName = subModuleName.replace(/[^a-zA-Z0-9\-]/g, '_').toLowerCase();
    const finalDir = path.join(process.cwd(), 'downloads', safeModuleName, safeSubModuleName);
    const contextStr = filterContext.length > 0 ? filterContext.join('_') : 'default';

    if (fs.existsSync(finalDir)) {
        const existingFiles = fs.readdirSync(finalDir);
        const fileExists = existingFiles.some(f => f.startsWith(`relatorio_${contextStr}.`));
        if (fileExists) {
            log.info(`Arquivo para o contexto [${filterContext.join(', ')}] já existe. Pulando extração.`);
            return true;
        }
    }

    const btnDownloadSelector = 'button[aria-label="Download"]';
    const btnViewSelector = 'button[aria-label="Ver em tela"]';

    const downloadButton = await page.$(btnDownloadSelector);

    let isDownloadDisabled = true;
    if (downloadButton) {
        isDownloadDisabled = await page.evaluate(btn => btn?.hasAttribute('disabled'), downloadButton);
    }

    if (isDownloadDisabled) {
        const viewButton = await page.$(btnViewSelector);
        let isViewDisabled = true;
        if (viewButton) {
            isViewDisabled = await page.evaluate(btn => btn?.hasAttribute('disabled'), viewButton);
        }

        if (!isViewDisabled && viewButton) {
            log.info(`Download indisponível. Acionando "Ver em tela" para extrair JSON no contexto [${filterContext.join(', ')}].`);

            const responsePromise = page.waitForResponse(
                (response) => {
                    const req = response.request();
                    return (req.resourceType() === 'fetch' || req.resourceType() === 'xhr')
                        && response.url().includes('relatorioaps');
                },
                { timeout: 15000 }
            ).catch(() => null);

            await viewButton.click();
            const response = await responsePromise;

            if (response && response.ok()) {
                try {
                    const jsonData = await response.json();
                    if (!fs.existsSync(finalDir)) fs.mkdirSync(finalDir, { recursive: true });

                    const finalFileName = `relatorio_${contextStr}.json`;

                    fs.writeFileSync(path.join(finalDir, finalFileName), JSON.stringify(jsonData, null, 2), 'utf-8');
                    log.info(`Arquivo JSON salvo com sucesso: ${finalDir}/${finalFileName}`);
                    return true;
                } catch (e) {
                    log.error(`Erro ao parsear JSON da resposta para contexto [${filterContext.join(', ')}]`);
                    return false;
                }
            }

            log.warn(`Nenhuma resposta de API válida capturada ao "Ver em tela" no contexto [${filterContext.join(', ')}].`);
            return false;
        }

        log.warn(`Ambos botões (Download e Ver em tela) desabilitados para a combinação: [${filterContext.join(', ')}]`);
        return false;
    }

    // Diretório temporário único para isolar o download atual e garantir a nomeação correta
    const tempDir = path.join(process.cwd(), 'temp_downloads', `${Date.now()}_${Math.random().toString(36).substring(7)}`);
    fs.mkdirSync(tempDir, { recursive: true });

    const client = await page.target().createCDPSession();
    await client.send('Page.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: tempDir,
    });

    await downloadButton!.click();
    log.info(`Download acionado para contexto [${filterContext.join(', ')}]. Aguardando conclusão...`);

    let downloadedFile = '';
    // Aguarda até 60 segundos pelo fim do arquivo .crdownload
    for (let attempts = 0; attempts < 60; attempts++) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        if (fs.existsSync(tempDir)) {
            const files = fs.readdirSync(tempDir);
            if (files.length > 0) {
                const isDownloading = files.some(f => f.endsWith('.crdownload') || f.endsWith('.tmp'));
                if (!isDownloading) {
                    downloadedFile = files[0];
                    break;
                }
            }
        }
    }

    let saved = false;
    if (downloadedFile) {
        if (!fs.existsSync(finalDir)) fs.mkdirSync(finalDir, { recursive: true });

        const ext = path.extname(downloadedFile);
        const finalFileName = `relatorio_${contextStr}${ext}`;

        fs.renameSync(path.join(tempDir, downloadedFile), path.join(finalDir, finalFileName));
        log.info(`Arquivo salvo com sucesso: ${finalDir}/${finalFileName}`);
        saved = true;
    } else {
        log.error(`Falha ou timeout no download para o contexto [${filterContext.join(', ')}]`);
    }

    if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }

    return saved;
}

// ---------------------------------------------------------------------------
// Iteração recursiva pelos filtros
// ---------------------------------------------------------------------------

/**
 * Retorna true quando a iteração deve parar (modo singleFile e arquivo obtido).
 */
async function iterateDropdownsRecursively(
    page: Page,
    depth: number,
    moduleName: string,
    subModuleName: string,
    log: any,
    opts: RunOptions,
    filterContext: number[] = []
): Promise<boolean> {
    await new Promise(resolve => setTimeout(resolve, 1500)); // Aguarda renderização e mutações no DOM

    // Busca de forma dinâmica apenas os dropdowns que estão efetivamente visíveis na tela atual
    const visibleSelectors = await page.$$eval('p-dropdown', (elements) => {
        return elements
            .filter(el => {
                const htmlEl = el as HTMLElement;
                const style = window.getComputedStyle(htmlEl);
                return style.display !== 'none' && style.visibility !== 'hidden' && htmlEl.offsetWidth > 0 && htmlEl.offsetHeight > 0;
            })
            .map((el, index) => {
                const formControlName = el.getAttribute('formcontrolname');
                const inputId = el.getAttribute('inputid');
                if (formControlName) return `p-dropdown[formcontrolname="${formControlName}"]`;
                if (inputId) return `p-dropdown[inputid="${inputId}"]`;
                return `p-dropdown:nth-of-type(${index + 1})`;
            });
    });

    if (depth >= visibleSelectors.length) {
        const gotFile = await triggerDownloadAndSave(page, moduleName, subModuleName, filterContext, log);
        return opts.singleFile && gotFile;
    }

    const selector = visibleSelectors[depth];

    const isDropdownDisabled = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        return el ? el.querySelector('.p-disabled') !== null : true;
    }, selector).catch(() => true);

    if (isDropdownDisabled) {
        return iterateDropdownsRecursively(page, depth + 1, moduleName, subModuleName, log, opts, [...filterContext, -1]);
    }

    const count = await getDropdownOptionsCount(page, selector);
    const hasPlaceholder = await page.evaluate((sel) => {
        const text = document.querySelector(`${sel} .p-dropdown-label`)?.textContent?.trim().toLowerCase();
        return text === 'selecione' || text === '' || document.querySelector(`${sel} .p-placeholder`) !== null;
    }, selector);

    const startIndex = hasPlaceholder ? 1 : 0;

    for (let i = startIndex; i < count; i++) {
        log.info(`Selecionando opção índice ${i} no dropdown: ${selector}`);
        const clicked = await selectPrimeNgOption(page, selector, i);
        if (clicked) {
            const shouldStop = await iterateDropdownsRecursively(page, depth + 1, moduleName, subModuleName, log, opts, [...filterContext, i]);
            if (shouldStop) return true;
        }
    }

    return false;
}

async function processModulePage(page: Page, url: string, moduleName: string, log: any, opts: RunOptions): Promise<void> {
    log.info(`Acessando a página: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle2' });
    await new Promise(resolve => setTimeout(resolve, 2000));

    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    const subModuleName = pathParts.length > 0 ? pathParts[pathParts.length - 1] : 'default';

    await iterateDropdownsRecursively(page, 0, moduleName, subModuleName, log, opts, []);
}

/**
 * Processa os módulos no intervalo [startIdx, endIdx] (índices 0-based, inclusivos).
 * No primeiro módulo do intervalo, começa a partir do link `startLinkIdx` (0-based);
 * nos módulos seguintes, processa todos os links.
 */
async function runModules(
    page: Page,
    modules: ScrapedModules[],
    startIdx: number,
    endIdx: number,
    opts: RunOptions,
    startLinkIdx: number = 0
): Promise<void> {
    const log = logger.forMethod('runModules');

    for (let m = startIdx; m <= endIdx; m++) {
        const mod = modules[m];
        log.info(`=== Módulo [${m + 1}/${modules.length}]: ${mod.module} ===`);

        const firstLink = m === startIdx ? startLinkIdx : 0;

        for (let l = firstLink; l < mod.links.length; l++) {
            const link = mod.links[l];
            try {
                log.info(`Link [${l + 1}/${mod.links.length}]`);
                log.info(`Iniciando extração do módulo: ${mod.module} | Link: ${link}`);
                await processModulePage(page, link, mod.module, log, opts);
            } catch (error) {
                log.error({ err: error }, `Falha ao processar a página ${link}`);
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Interface de linha de comando
// ---------------------------------------------------------------------------

async function askChoice(rl: readline.Interface, question: string, valid: string[]): Promise<string> {
    while (true) {
        const answer = (await rl.question(question)).trim();
        if (valid.includes(answer)) return answer;
        console.log(`  Opção inválida. Escolha entre: ${valid.join(', ')}`);
    }
}

async function askModuleIndex(rl: readline.Interface, question: string, total: number): Promise<number> {
    while (true) {
        const answer = (await rl.question(question)).trim();
        const n = Number(answer);
        if (Number.isInteger(n) && n >= 1 && n <= total) return n - 1;
        console.log(`  Índice inválido. Informe um número entre 1 e ${total}.`);
    }
}

function printModules(modules: ScrapedModules[]): void {
    console.log('\nMódulos encontrados na main page:');
    modules.forEach((mod, i) => {
        console.log(`  [${i + 1}] ${mod.module} (${mod.links.length} link(s))`);
        mod.links.forEach((link, l) => {
            console.log(`        ${i + 1}.${l + 1}  ${link}`);
        });
    });
    console.log('');
}

async function main(): Promise<void> {
    const log = logger.forMethod('main');
    const rl = readline.createInterface({ input, output });
    let browser: Browser | null = null;

    try {
        console.log('\n=== Scrapper - CLI de testes ===');
        console.log('  [1] Fluxo padrão: main page + todos os módulos');
        console.log('  [2] Fluxo interativo: main page + escolha de módulo(s) e tipo de download\n');

        const flow = await askChoice(rl, 'Escolha o fluxo (1/2): ', ['1', '2']);

        browser = await puppeteer.launch({ headless: HEADLESS });
        const page = await browser.newPage();

        const modules = await mainPageScrapper(page);

        if (modules.length === 0) {
            log.warn('Nenhum módulo encontrado na main page. Encerrando.');
            return;
        }

        // ---- Fluxo 1: padrão ----
        if (flow === '1') {
            await runModules(page, modules, 0, modules.length - 1, { singleFile: false });
            log.info('Processo global de scraping e downloads finalizado com sucesso!');
            return;
        }

        // ---- Fluxo 2: interativo ----
        printModules(modules);

        console.log('Escopo da execução:');
        console.log('  [1] Apenas um módulo específico (para ao terminar)');
        console.log('  [2] Todos os módulos a partir de um índice\n');
        const scope = await askChoice(rl, 'Escolha o escopo (1/2): ', ['1', '2']);

        const startIdx = await askModuleIndex(
            rl,
            scope === '1'
                ? `Índice do módulo (1-${modules.length}): `
                : `Índice do módulo inicial (1-${modules.length}): `,
            modules.length
        );
        const endIdx = scope === '1' ? startIdx : modules.length - 1;

        const selectedModule = modules[startIdx];
        if (selectedModule.links.length === 0) {
            log.warn(`O módulo "${selectedModule.module}" não possui links. Encerrando.`);
            return;
        }

        console.log(`\nLinks do módulo "${selectedModule.module}":`);
        selectedModule.links.forEach((link, l) => {
            console.log(`  [${l + 1}] ${link}`);
        });
        console.log('');
        const startLinkIdx = await askModuleIndex(
            rl,
            `Índice do link inicial (1-${selectedModule.links.length}): `,
            selectedModule.links.length
        );

        console.log('\nTipo de download:');
        console.log('  [1] Apenas 1 arquivo por página (primeira combinação de filtros; não baixa se já existir)');
        console.log('  [2] Todos os arquivos do módulo\n');
        const dl = await askChoice(rl, 'Escolha o tipo de download (1/2): ', ['1', '2']);

        const opts: RunOptions = { singleFile: dl === '1' };

        console.log(
            `\nExecutando: módulo ${startIdx + 1}, a partir do link ${startLinkIdx + 1}` +
            (endIdx !== startIdx ? ` (e módulos seguintes até o ${endIdx + 1})` : '') +
            ` | download: ${opts.singleFile ? '1 arquivo por página' : 'todos os arquivos'}\n`
        );

        await runModules(page, modules, startIdx, endIdx, opts, startLinkIdx);
        log.info('Execução interativa finalizada com sucesso!');
    } catch (error) {
        log.error({ err: error }, 'Falha crítica na execução da CLI.');
        process.exitCode = 1;
    } finally {
        rl.close();
        if (browser) await browser.close();
    }
}

await main();