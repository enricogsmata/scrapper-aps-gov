import puppeteer, { Page, Puppeteer } from "puppeteer";
import { MAIN_URL } from "./config.js";
import { new_logger } from "./services/logs.js";
import fs from "fs";
import path from "path";

const logger = new_logger(import.meta.url);

export interface ScrapedModules {
    module: string,
    links: string[],
}

export async function mainPageScrapper(page: Page): Promise<ScrapedModules[]> {
    const log = logger.forMethod('mainPageScrapper');

    const cssSelectorButtons: string = "button.botao-modulo";
    const cssSelectorMenuItems: string = "div.item-menu";

    log.info('Iniciando extração de dados da página principal...');
    await page.goto(MAIN_URL.toString());

    await page.waitForSelector(cssSelectorButtons, { visible: true });

    const totalButtons: number = await page.$$eval(cssSelectorButtons,
        (elements) => elements.length
    );

    let modules: ScrapedModules[] = [];

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
        })
    }

    log.info('Extração de dados da página principal concluída!');
    return modules;
}

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

export async function downloadPagamentoExcels(): Promise<void> {
    const log = logger.forMethod('downloadPagamentoExcels');
    const targetUrl = 'https://relatorioaps.saude.gov.br/gerenciaaps/pagamento';
    const downloadPath = path.resolve(process.cwd(), 'downloads');

    if (!fs.existsSync(downloadPath)) {
        fs.mkdirSync(downloadPath, { recursive: true });
    }

    log.info('Iniciando navegador para downloads...');
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    const client = await page.target().createCDPSession();
    await client.send('Page.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: downloadPath,
    });

    log.info(`Acessando a página: ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'networkidle2' });

    const selectors = {
        tipoUnidade: 'p-dropdown[formcontrolname="tipoUnidade"]',
        estado: 'p-dropdown[formcontrolname="estadoSelecionado"]',
        ano: 'p-dropdown[formcontrolname="periodoSelecionado"]',
        parcelaInicio: 'p-dropdown[formcontrolname="parcelaInicioSelecionada"]',
        parcelaFim: 'p-dropdown[formcontrolname="parcelaFimSelecionada"]',
        btnDownload: 'button[aria-label="Download"]'
    };

    try {
        await page.waitForSelector(selectors.tipoUnidade, { visible: true });

        // Garante a seleção da opção "Estado" (índice 0) para seguir a hierarquia do HTML fornecido
        await selectPrimeNgOption(page, selectors.tipoUnidade, 0);

        const numEstados = await getDropdownOptionsCount(page, selectors.estado);
        log.info(`Encontrados ${numEstados - 1} estados para iterar.`);

        // Inicia em 1 para pular o placeholder/opção vazia inicial
        for (let e = 1; e < numEstados; e++) {
            log.info(`Selecionando estado índice ${e}...`);
            await selectPrimeNgOption(page, selectors.estado, e);

            const numAnos = await getDropdownOptionsCount(page, selectors.ano);
            for (let a = 0; a < numAnos; a++) {
                log.info(`Selecionando ano índice ${a}...`);
                await selectPrimeNgOption(page, selectors.ano, a);

                const numParcelaInicio = await getDropdownOptionsCount(page, selectors.parcelaInicio);
                for (let pi = 0; pi < numParcelaInicio; pi++) {
                    await selectPrimeNgOption(page, selectors.parcelaInicio, pi);

                    const numParcelaFim = await getDropdownOptionsCount(page, selectors.parcelaFim);
                    // Otimização: a parcela final iterada sempre começa a partir da parcela inicial selecionada
                    for (let pf = pi; pf < numParcelaFim; pf++) {
                        await selectPrimeNgOption(page, selectors.parcelaFim, pf);

                        log.info(`Tentando download (Estado idx: ${e}, Ano idx: ${a}, Início idx: ${pi}, Fim idx: ${pf})...`);

                        const downloadButton = await page.$(selectors.btnDownload);
                        const isDisabled = await page.evaluate(btn => btn?.hasAttribute('disabled'), downloadButton);

                        if (!isDisabled) {
                            await downloadButton?.click();
                            log.info('Download acionado, aguardando conclusão...');
                            await new Promise(resolve => setTimeout(resolve, 5000));
                        } else {
                            log.warn('Botão de download desabilitado para esta combinação de filtros.');
                        }
                    }
                }
            }
        }
    } catch (error) {
        log.error({ err: error }, 'Falha crítica durante a extração e download dos relatórios.');
    } finally {
        await browser.close();
        log.info('Processo de scraping e downloads finalizado.');
    }
}

async function triggerDownloadAndSave(page: Page, moduleName: string, subModuleName: string, filterContext: number[], log: any): Promise<void> {
    const safeModuleName = moduleName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    const safeSubModuleName = subModuleName.replace(/[^a-zA-Z0-9\-]/g, '_').toLowerCase();
    const finalDir = path.join(process.cwd(), 'downloads', safeModuleName, safeSubModuleName);
    const contextStr = filterContext.length > 0 ? filterContext.join('_') : 'default';

    if (fs.existsSync(finalDir)) {
        const existingFiles = fs.readdirSync(finalDir);
        const fileExists = existingFiles.some(f => f.startsWith(`relatorio_${contextStr}.`));
        if (fileExists) {
            log.info(`Arquivo para o contexto [${filterContext.join(', ')}] já existe. Pulando extração.`);
            return;
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
                } catch (e) {
                    log.error(`Erro ao parsear JSON da resposta para contexto [${filterContext.join(', ')}]`);
                }
            } else {
                log.warn(`Nenhuma resposta de API válida capturada ao "Ver em tela" no contexto [${filterContext.join(', ')}].`);
            }
            return;
        }

        log.warn(`Ambos botões (Download e Ver em tela) desabilitados para a combinação: [${filterContext.join(', ')}]`);
        return;
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

    if (downloadedFile) {
        if (!fs.existsSync(finalDir)) fs.mkdirSync(finalDir, { recursive: true });

        const ext = path.extname(downloadedFile);
        const finalFileName = `relatorio_${contextStr}${ext}`;

        fs.renameSync(path.join(tempDir, downloadedFile), path.join(finalDir, finalFileName));
        log.info(`Arquivo salvo com sucesso: ${finalDir}/${finalFileName}`);
    } else {
        log.error(`Falha ou timeout no download para o contexto [${filterContext.join(', ')}]`);
    }

    if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
}

async function iterateDropdownsRecursively(page: Page, depth: number, moduleName: string, subModuleName: string, log: any, filterContext: number[] = []): Promise<void> {
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
        await triggerDownloadAndSave(page, moduleName, subModuleName, filterContext, log);
        return;
    }

    const selector = visibleSelectors[depth];

    const isDropdownDisabled = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        return el ? el.querySelector('.p-disabled') !== null : true;
    }, selector).catch(() => true);

    if (isDropdownDisabled) {
        await iterateDropdownsRecursively(page, depth + 1, moduleName, subModuleName, log, [...filterContext, -1]);
        return;
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
            await iterateDropdownsRecursively(page, depth + 1, moduleName, subModuleName, log, [...filterContext, i]);
        }
    }
}

async function processModulePage(page: Page, url: string, moduleName: string, log: any): Promise<void> {
    log.info(`Acessando a página: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle2' });
    await new Promise(resolve => setTimeout(resolve, 2000));

    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    const subModuleName = pathParts.length > 0 ? pathParts[pathParts.length - 1] : 'default';

    await iterateDropdownsRecursively(page, 0, moduleName, subModuleName, log, []);
}

export async function runScrapper() {
    const log = logger.forMethod('runScrapper');
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    const modules: ScrapedModules[] = await mainPageScrapper(page);

    log.info('Iniciando navegador para iterar nos módulos extraídos...');

    for (const mod of modules) {
        for (const link of mod.links) {
            try {
                log.info(`Iniciando extração do módulo: ${mod.module} | Link: ${link}`);
                await processModulePage(page, link, mod.module, log);
            } catch (error) {
                log.error({ err: error }, `Falha ao processar a página ${link}`);
            }
        }
    }

    await browser.close();
    log.info('Processo global de scraping e downloads finalizado com sucesso!');
}