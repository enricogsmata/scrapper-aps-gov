import puppeteer, { Browser, ElementHandle, Page } from "puppeteer";
import { MAIN_URL } from "./config.js";
import { new_logger } from "./services/logs.js";
import fs from "fs";
import path from "path";

const logger = new_logger(import.meta.url);

export interface ScrapedModules {
    module: string,
    links: string[],
}

/**
 * Parâmetros opcionais de execução. Todos têm default, então `runScrapper()`
 * sem argumentos continua percorrendo todos os módulos e baixando todos os arquivos.
 * Índices são 0-based e inclusivos.
 */
export interface ScrapeOptions {
    /** true = baixa só o arquivo da primeira combinação de filtros de cada página e passa para a próxima */
    singleFile?: boolean,
    /** Primeiro módulo a processar (default: 0) */
    startModule?: number,
    /** Último módulo a processar (default: último módulo) */
    endModule?: number,
    /** Link inicial dentro do primeiro módulo; nos demais módulos todos os links são processados (default: 0) */
    startLink?: number,
    /** Executa o navegador sem interface (default: true). Só vale quando o runScrapper abre o navegador. */
    headless?: boolean,
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

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

interface RadioOption {
    id: string;
    name: string;
    value: string;
    label: string;
}

interface RadioGroup {
    key: string;
    options: RadioOption[];
}

async function getVisibleRadioGroups(page: Page): Promise<RadioGroup[]> {
    await page.evaluate('window.__name = window.__name || ((fn) => fn);').catch(() => { });

    return await page.evaluate(() => {
        const allRadios = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="radio"]'))
            .filter(input => {
                const wrapper = (input.closest('p-radiobutton, .br-radio, .radio') || input) as HTMLElement;
                const style = window.getComputedStyle(wrapper);
                return style.display !== 'none' && style.visibility !== 'hidden' && wrapper.offsetWidth > 0 && wrapper.offsetHeight > 0;
            });

        const nameCounts: Record<string, number> = {};
        allRadios.forEach(r => {
            if (r.name) nameCounts[r.name] = (nameCounts[r.name] || 0) + 1;
        });

        const groupsMap = new Map<string, HTMLInputElement[]>();

        allRadios.forEach((r, idx) => {
            if (r.name && nameCounts[r.name] > 1) {
                const key = `name:${r.name}`;
                if (!groupsMap.has(key)) groupsMap.set(key, []);
                groupsMap.get(key)!.push(r);
            } else {
                let parent = r.parentElement;
                let container: HTMLElement | null = null;
                while (parent && parent !== document.body) {
                    const inParent = parent.querySelectorAll('input[type="radio"]');
                    if (inParent.length > 1) {
                        container = parent;
                        break;
                    }
                    parent = parent.parentElement;
                }
                const containerKey = container
                    ? (container.getAttribute('formcontrolname') || container.id || container.className || `container_${idx}`)
                    : `radio_${idx}`;
                const key = `group:${containerKey}`;
                if (!groupsMap.has(key)) groupsMap.set(key, []);
                groupsMap.get(key)!.push(r);
            }
        });

        const groups: RadioGroup[] = [];
        groupsMap.forEach((radios, key) => {
            if (radios.length > 1) {
                groups.push({
                    key,
                    options: radios.map(r => {
                        const lbl = document.querySelector(`label[for="${r.id}"]`)?.textContent?.trim() ||
                            r.closest('p-radiobutton, .br-radio, .radio')?.textContent?.trim() ||
                            r.value || r.id;
                        return {
                            id: r.id,
                            name: r.name,
                            value: r.value,
                            label: lbl
                        };
                    })
                });
            }
        });

        return groups;
    });
}

async function selectRadioOption(page: Page, option: RadioOption): Promise<void> {
    await page.evaluate((opt) => {
        if (opt.id) {
            const input = document.getElementById(opt.id) as HTMLInputElement | null;
            const box = input?.closest('p-radiobutton')?.querySelector('.p-radiobutton-box') as HTMLElement | null;
            if (box) {
                box.click();
                return;
            }
            const lbl = document.querySelector(`label[for="${opt.id}"]`) as HTMLElement | null;
            if (lbl) {
                lbl.click();
                return;
            }
            if (input) {
                input.click();
                input.dispatchEvent(new Event('change', { bubbles: true }));
                return;
            }
        }
        if (opt.value) {
            const input = document.querySelector(`input[type="radio"][value="${opt.value}"]`) as HTMLInputElement | null;
            if (input) {
                const box = input.closest('p-radiobutton')?.querySelector('.p-radiobutton-box') as HTMLElement | null;
                if (box) {
                    box.click();
                    return;
                }
                const lbl = document.querySelector(`label[for="${input.id}"]`) as HTMLElement | null;
                if (lbl) {
                    lbl.click();
                    return;
                }
                input.click();
                input.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
    }, option);

    await sleep(1500);
    await page.waitForNetworkIdle({ idleTime: 1000, timeout: 10000 }).catch(() => { });
}

async function iterateFormControlsRecursively(
    page: Page,
    moduleName: string,
    subModuleName: string,
    log: any,
    singleFile: boolean,
    filterContext: (number | string)[] = [],
    visitedRadioKeys: string[] = []
): Promise<boolean> {
    await sleep(1500);

    const radioGroups = await getVisibleRadioGroups(page);
    const unvisitedGroup = radioGroups.find(g => !visitedRadioKeys.includes(g.key));

    if (unvisitedGroup) {
        for (let i = 0; i < unvisitedGroup.options.length; i++) {
            const opt = unvisitedGroup.options[i];
            log.info(`Selecionando rádio [${opt.label}] no grupo [${unvisitedGroup.key}]`);
            await selectRadioOption(page, opt);

            const shouldStop = await iterateFormControlsRecursively(
                page,
                moduleName,
                subModuleName,
                log,
                singleFile,
                [...filterContext, `r${i}`],
                [...visitedRadioKeys, unvisitedGroup.key]
            );
            if (shouldStop) return true;
        }
        return false;
    }

    return await iterateDropdownsRecursively(page, 0, moduleName, subModuleName, log, singleFile, filterContext);
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
    await sleep(1500);
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
    await sleep(500);
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
                            await sleep(5000);
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

async function triggerLegacyDownloadAndSave(
    page: Page,
    moduleName: string,
    subModuleName: string,
    filterContext: string[],
    log: any
): Promise<boolean> {
    const safeModuleName = moduleName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    const safeSubModuleName = subModuleName.replace(/[^a-zA-Z0-9\-]/g, '_').toLowerCase();
    const finalDir = path.join(process.cwd(), 'downloads', safeModuleName, safeSubModuleName);
    const contextStr = filterContext.length > 0 ? filterContext.map(c => c.replace(/[^a-zA-Z0-9]/g, '')).join('_') : 'default';

    if (fs.existsSync(finalDir)) {
        const existingFiles = fs.readdirSync(finalDir);
        const fileExists = existingFiles.some(f => f.startsWith(`relatorio_${contextStr}.`));
        if (fileExists) {
            log.info(`Arquivo para o contexto [${filterContext.join(', ')}] já existe. Pulando extração.`);
            return true;
        }
    }

    const downloadElementToClick = await page.evaluateHandle(() => {
        const label = document.querySelector('label[for*="Download"], label.btn-app');
        if (label && (label.textContent?.includes('Download') || (label as HTMLLabelElement).htmlFor?.includes('Download'))) {
            return label;
        }
        const input = document.querySelector('input[type="submit"][value="Download"], input[value="Download"]');
        if (input) return input;
        return null;
    });

    const el = downloadElementToClick.asElement() as import("puppeteer").ElementHandle<Element> | null;

    if (!el) {
        log.warn(`Nenhum botão de download encontrado (Legacy) para a combinação: [${filterContext.join(', ')}]`);
        return false;
    }

    const tempDir = path.join(process.cwd(), 'temp_downloads', `${Date.now()}_${Math.random().toString(36).substring(7)}`);
    fs.mkdirSync(tempDir, { recursive: true });

    const client = await page.target().createCDPSession();
    await client.send('Page.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: tempDir,
    });

    await page.evaluate((elem) => {
        (elem as HTMLElement).click();
    }, el);
    log.info(`Download acionado (Legacy) para contexto [${filterContext.join(', ')}]. Aguardando conclusão...`);

    let downloadedFile = '';
    for (let attempts = 0; attempts < 60; attempts++) {
        await sleep(1000);
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
        log.error(`Falha ou timeout no download (Legacy) para o contexto [${filterContext.join(', ')}]`);
    }

    if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }

    return saved;
}

async function iterateLegacyDropdownsRecursively(
    page: Page,
    depth: number,
    moduleName: string,
    subModuleName: string,
    log: any,
    singleFile: boolean,
    filterContext: string[] = [],
    selectSelectors: string[]
): Promise<boolean> {
    await sleep(1500);

    if (depth >= selectSelectors.length) {
        const gotFile = await triggerLegacyDownloadAndSave(page, moduleName, subModuleName, filterContext, log);
        return singleFile && gotFile;
    }

    const selector = selectSelectors[depth];

    const isDisabled = await page.$eval(selector, el => (el as HTMLSelectElement).disabled).catch(() => true);

    if (isDisabled) {
        return iterateLegacyDropdownsRecursively(page, depth + 1, moduleName, subModuleName, log, singleFile, [...filterContext, 'disabled'], selectSelectors);
    }

    const options = await page.$$eval(`${selector} option`, opts => {
        return opts.map((o: any) => ({ value: o.value, text: o.textContent.trim() }))
            .filter(o => o.value !== '99' && o.value !== '');
    });

    if (options.length === 0) {
        return iterateLegacyDropdownsRecursively(page, depth + 1, moduleName, subModuleName, log, singleFile, [...filterContext, 'empty'], selectSelectors);
    }

    for (let i = 0; i < options.length; i++) {
        const opt = options[i];
        log.info(`Selecionando opção ${opt.text} no select: ${selector}`);
        await page.select(selector, opt.value);

        await page.evaluate((sel) => {
            const el = document.querySelector(sel);
            if (el) el.dispatchEvent(new Event('change', { bubbles: true }));
        }, selector);

        await page.waitForNetworkIdle({ idleTime: 1000, timeout: 15000 }).catch(() => { });
        await sleep(1500);

        const shouldStop = await iterateLegacyDropdownsRecursively(page, depth + 1, moduleName, subModuleName, log, singleFile, [...filterContext, opt.text], selectSelectors);
        if (shouldStop) return true;
    }

    return false;
}

async function processLegacyModulePage(page: Page, url: string, moduleName: string, log: any, singleFile: boolean): Promise<void> {
    log.info(`Acessando a página legacy: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle2' });
    await sleep(2000);

    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    const subModuleName = pathParts.length > 0 ? pathParts[pathParts.length - 1].replace('.xhtml', '') : 'legacy_default';

    const isAngularPage = await page.$('app-root, p-dropdown');
    if (isAngularPage) {
        log.info(`Página anterior possui estrutura Angular/PrimeNG: ${url}`);
        await iterateFormControlsRecursively(page, moduleName, subModuleName, log, singleFile, []);
        return;
    }

    const selects = await page.$$eval('select', (elements) => {
        return elements.map(el => {
            const id = el.getAttribute('id');
            const name = el.getAttribute('name');
            if (id) return `select[id="${id}"]`;
            if (name) return `select[name="${name}"]`;
            return '';
        }).filter(Boolean);
    });

    if (selects.length > 0) {
        log.info(`Encontrados ${selects.length} filtros (select) na página legacy.`);
        await iterateLegacyDropdownsRecursively(page, 0, moduleName, subModuleName, log, singleFile, [], selects);
    } else {
        await triggerLegacyDownloadAndSave(page, moduleName, subModuleName, [], log);
    }
}

/**
 * Retorna true se, ao final, existe um arquivo para o contexto
 * (baixado agora ou já existente). Retorna false em caso de falha/botões desabilitados.
 */
async function triggerDownloadAndSave(page: Page, moduleName: string, subModuleName: string, filterContext: (number | string)[], log: any): Promise<boolean> {
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

    let downloadElementToClick: ElementHandle<Element> | null = null;

    if (!isDownloadDisabled && downloadButton) {
        downloadElementToClick = downloadButton;
    } else {
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

        // Alternativa para interfaces com "Aplicar filtro" e tabela dinâmica ("Relatório Geral")
        const applyBtn = await page.evaluateHandle(() => {
            const btns = Array.from(document.querySelectorAll('button.br-button.primary'));
            return btns.find(b => b.textContent && b.textContent.includes('Aplicar filtro')) ?? null;
        });
        const applyEl = applyBtn.asElement() as ElementHandle<Element> | null;

        if (applyEl) {
            await applyEl.click();
            log.info(`"Aplicar filtro" acionado no contexto [${filterContext.join(', ')}]. Aguardando tabela...`);

            // Evita pegar o botão de uma tabela renderizada por um filtro anterior
            await page.waitForNetworkIdle({ idleTime: 1000, timeout: 15000 }).catch(() => { });

            const tableDownloadSelector = 'button.border-none.bg-transparent:has(i.fa-download)';
            try {
                await page.waitForSelector(tableDownloadSelector, { visible: true, timeout: 15000 });
                const tableButton = await page.$(tableDownloadSelector);
                const tableButtonDisabled = tableButton
                    ? await page.evaluate(btn => btn.hasAttribute('disabled'), tableButton)
                    : true;
                if (tableButton && !tableButtonDisabled) {
                    downloadElementToClick = tableButton;
                }
            } catch {
                log.warn(`Botão de download da tabela não apareceu após aplicar filtro [${filterContext.join(', ')}].`);
            }
        }
    }

    if (!downloadElementToClick) {
        log.warn(`Nenhum fluxo de extração disponível (Download/Ver em Tela/Filtro) para a combinação: [${filterContext.join(', ')}]`);
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

    await downloadElementToClick.click();
    log.info(`Download acionado para contexto [${filterContext.join(', ')}]. Aguardando conclusão...`);

    let downloadedFile = '';
    // Aguarda até 60 segundos pelo fim do arquivo .crdownload
    for (let attempts = 0; attempts < 60; attempts++) {
        await sleep(1000);
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

/**
 * Retorna true quando a iteração deve parar (modo singleFile e arquivo obtido).
 */
async function iterateDropdownsRecursively(
    page: Page,
    depth: number,
    moduleName: string,
    subModuleName: string,
    log: any,
    singleFile: boolean,
    filterContext: (number | string)[] = []
): Promise<boolean> {
    await sleep(1500); // Aguarda renderização e mutações no DOM

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
                const id = el.getAttribute('id');
                if (formControlName) return `p-dropdown[formcontrolname="${formControlName}"]`;
                if (inputId) return `p-dropdown[inputid="${inputId}"]`;
                if (id) return `p-dropdown[id="${id}"]`;
                return `p-dropdown:nth-of-type(${index + 1})`;
            });
    });

    if (depth >= visibleSelectors.length) {
        const gotFile = await triggerDownloadAndSave(page, moduleName, subModuleName, filterContext, log);
        return singleFile && gotFile;
    }

    const selector = visibleSelectors[depth];

    const isDropdownDisabled = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        return el ? el.querySelector('.p-disabled') !== null : true;
    }, selector).catch(() => true);

    if (isDropdownDisabled) {
        return iterateDropdownsRecursively(page, depth + 1, moduleName, subModuleName, log, singleFile, [...filterContext, -1]);
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
            const shouldStop = await iterateDropdownsRecursively(page, depth + 1, moduleName, subModuleName, log, singleFile, [...filterContext, i]);
            if (shouldStop) return true;
        }
    }

    return false;
}

async function processModulePage(page: Page, url: string, moduleName: string, log: any, singleFile: boolean): Promise<void> {
    log.info(`Acessando a página: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle2' });
    await sleep(2000);

    // Mapeia e acessa relatórios legados
    const legacyLinks = await page.$$eval('ul.relatorios-anteriores__lista a', (anchors) => {
        return anchors.map(a => (a as HTMLAnchorElement).href);
    });

    for (const legacyUrl of legacyLinks) {
        log.info(`Iniciando extração do relatório anterior (Legacy): ${legacyUrl}`);
        const legacyPage = await page.browser().newPage();
        try {
            await processLegacyModulePage(legacyPage, legacyUrl, moduleName, log, singleFile);
        } catch (err) {
            log.error({ err }, `Erro ao processar página legacy: ${legacyUrl}`);
        } finally {
            await legacyPage.close();
        }
    }

    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    const subModuleName = pathParts.length > 0 ? pathParts[pathParts.length - 1] : 'default';

    // Verifica a existência de links de download diretos (ex: accordions em "Outros incentivos")
    const directLinks = await page.$$('a.br-button.primary');
    const validLinks: import("puppeteer").ElementHandle<Element>[] = [];

    for (const link of directLinks) {
        const text = await page.evaluate(el => el.textContent?.trim(), link);
        const hasHref = await page.evaluate(el => el.hasAttribute('href'), link);
        if (text === 'Download' && hasHref) {
            validLinks.push(link);
        }
    }

    if (validLinks.length > 0) {
        log.info(`Encontrados ${validLinks.length} links diretos de download na página.`);
        const safeModuleName = moduleName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
        const safeSubModuleName = subModuleName.replace(/[^a-zA-Z0-9\-]/g, '_').toLowerCase();
        const finalDir = path.join(process.cwd(), 'downloads', safeModuleName, safeSubModuleName);

        for (let i = 0; i < validLinks.length; i++) {
            const contextStr = `link_${i}`;

            if (fs.existsSync(finalDir)) {
                const existingFiles = fs.readdirSync(finalDir);
                if (existingFiles.some(f => f.startsWith(`relatorio_${contextStr}.`))) {
                    log.info(`Arquivo para o link [${i}] já existe. Pulando extração.`);
                    if (singleFile) return;
                    continue;
                }
            }

            const tempDir = path.join(process.cwd(), 'temp_downloads', `${Date.now()}_${Math.random().toString(36).substring(7)}`);
            fs.mkdirSync(tempDir, { recursive: true });

            const client = await page.target().createCDPSession();
            await client.send('Page.setDownloadBehavior', {
                behavior: 'allow',
                downloadPath: tempDir,
            });

            // Clica via evaluate para ignorar se o accordion estiver fechado (visibility: hidden)
            await page.evaluate((el) => (el as HTMLElement).click(), validLinks[i]);
            log.info(`Download direto acionado para link [${i}]. Aguardando conclusão...`);

            let downloadedFile = '';
            for (let attempts = 0; attempts < 60; attempts++) {
                await sleep(1000);
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
                log.error(`Falha ou timeout no download direto para o link [${i}]`);
            }

            if (fs.existsSync(tempDir)) {
                fs.rmSync(tempDir, { recursive: true, force: true });
            }

            if (singleFile) return;
        }
        return; // Interrompe o fluxo normal (dropdowns) se usou links diretos
    }

    await iterateFormControlsRecursively(page, moduleName, subModuleName, log, singleFile, []);
}

/**
 * Processa os módulos já extraídos da main page, respeitando as opções do usuário.
 * Exportada para quem já abriu o navegador e quer inspecionar os módulos antes de rodar (ex.: CLI).
 */
export async function runModules(page: Page, modules: ScrapedModules[], options: ScrapeOptions = {}): Promise<void> {
    const log = logger.forMethod('runModules');

    if (modules.length === 0) {
        log.warn('Nenhum módulo para processar.');
        return;
    }

    const lastIdx = modules.length - 1;
    const startModule = Math.min(Math.max(options.startModule ?? 0, 0), lastIdx);
    const endModule = Math.min(Math.max(options.endModule ?? lastIdx, startModule), lastIdx);
    const startLink = Math.max(options.startLink ?? 0, 0);
    const singleFile = options.singleFile ?? false;

    for (let m = startModule; m <= endModule; m++) {
        const mod = modules[m];
        log.info(`=== Módulo [${m + 1}/${modules.length}]: ${mod.module} ===`);

        const firstLink = m === startModule ? startLink : 0;

        for (let l = firstLink; l < mod.links.length; l++) {
            const link = mod.links[l];
            try {
                log.info(`Link [${l + 1}/${mod.links.length}] | Iniciando extração do módulo: ${mod.module} | Link: ${link}`);
                await processModulePage(page, link, mod.module, log, singleFile);
            } catch (error) {
                log.error({ err: error }, `Falha ao processar a página ${link}`);
            }
        }
    }
}

/**
 * Entrada programática: abre o navegador, extrai os módulos da main page e processa
 * conforme `options`. Sem argumentos, processa tudo.
 */
export async function runScrapper(options: ScrapeOptions = {}): Promise<void> {
    const log = logger.forMethod('runScrapper');
    const browser: Browser = await puppeteer.launch({ headless: options.headless ?? true });

    try {
        const page = await browser.newPage();
        const modules: ScrapedModules[] = await mainPageScrapper(page);

        log.info('Iniciando navegador para iterar nos módulos extraídos...');
        await runModules(page, modules, options);

        log.info('Processo global de scraping e downloads finalizado com sucesso!');
    } finally {
        await browser.close();
    }
}