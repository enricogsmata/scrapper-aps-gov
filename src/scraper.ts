// src/scraper.ts
import puppeteer, { Browser, ElementHandle, Page } from "puppeteer";
import { MAIN_URL } from "./types.js";
import { new_logger } from "./services/logs.js";
import { scrapeAusenciaEnvioProducao } from "./scrapers/ausencia_envio_producao.js";
import { scrapePagamento } from "./scrapers/pagamento.js";
import { scrapeRelatorioSolicitacoes } from "./scrapers/relatorio_solicitacoes.js";
import { scrapeInesCnesHomologados } from "./scrapers/ines_cnes_homologados.js";
import { scrapeOutrosIncentivos } from "./scrapers/outros_incentivos.js";
import { scrapeSolicitacoesAdesao } from "./scrapers/solicitacoes_adesao.js";
import { scrapeCoberturaAps } from "./scrapers/cobertura_aps.js";

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

export async function mainPageScrapper(page: Page): Promise<ScrapedModules[]> {
    const log = logger.forMethod('mainPageScrapper');

    const cssSelectorButtons: string = "button.botao-modulo";
    const cssSelectorMenuItems: string = "div.item-menu";

    log.info('Iniciando extração de dados da página principal...');
    await page.goto(MAIN_URL);

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


        const menuItems = await page.$$eval(
            `${cssSelectorMenuItems} .ng-star-inserted`,
            (elements, mainUrl) => {
                return elements
                    .map((element) => (element as HTMLAnchorElement).href)
                    .filter(href => Boolean(href) && !(href === mainUrl));
            },
            MAIN_URL
        );


        modules.push({
            module: moduleName,
            links: menuItems,
        })
    }

    log.info('Extração de dados da página principal concluída!');
    return modules;
}

/**
 * Entrada programática: abre o navegador, extrai os módulos da main page e processa
 * conforme `options`. Sem argumentos, processa tudo.
 */
export async function runScrapper(): Promise<void> {
    const log = logger.forMethod('runScrapper');
    const browser: Browser = await puppeteer.launch({ headless: true });

    try {
        const page = await browser.newPage();
        const modules: ScrapedModules[] = await mainPageScrapper(page);

        for (const module of modules) {
            const moduleName = module.module
                .toLowerCase()
                .trimEnd()
                .replaceAll(/\s+/g, "-")
            log.info(`Processando módulo: ${moduleName}`);

            for (const link of module.links) {
                if (link.includes('ausencia-envio-producao')) {
                    //await scrapeAusenciaEnvioProducao(page, moduleName, link);
                    //return;
                } else if (link.includes('pagamento')) {
                    //await scrapePagamento(page, moduleName, link);
                    //return;
                } else if (link.includes('ines-cnes-homologados')) {
                    //await scrapeInesCnesHomologados(page, moduleName, link);
                    //return;
                } else if (link.includes('relatorio-solicitacoes')) {
                    //await scrapeRelatorioSolicitacoes(page, moduleName, link);
                    //return;
                } else if (link.includes('solicitacoes-adesao')) {
                    //await scrapeSolicitacoesAdesao(page, moduleName, link);
                    //return;
                } else if (link.includes('outros-incentivos')) {
                    //await scrapeOutrosIncentivos(page, moduleName, link);
                    //return;
                } else if (link.includes('cobertura/aps')) {
                    await scrapeCoberturaAps(page, moduleName, link);
                    return;
                } else {
                    log.info(`Link não mapeado para scraper específico: ${link}`);
                    return;
                }
            }
        }

        log.info('Processo global de scraping e downloads finalizado com sucesso!');
    } finally {
        await browser.close();
    }
}