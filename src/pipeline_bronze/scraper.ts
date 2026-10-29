// src/scraper.ts
import puppeteer, { Browser, ElementHandle, Page } from "puppeteer";
import { MAIN_URL } from "./types.js";
import { new_logger } from "../services/logs.js";
import { scrapeAusenciaEnvioProducao } from "./scrapers/ausencia_envio_producao.js";
import { scrapePagamento } from "./scrapers/pagamento.js";
import { scrapeRelatorioSolicitacoes } from "./scrapers/relatorio_solicitacoes.js";
import { scrapeInesCnesHomologados } from "./scrapers/ines_cnes_homologados.js";
import { scrapeOutrosIncentivos } from "./scrapers/outros_incentivos.js";
import { scrapeSolicitacoesAdesao } from "./scrapers/solicitacoes_adesao.js";
import { scrapeCoberturaAps } from "./scrapers/cobertura_aps.js";
import { scrapeCoberturaSaudeBucal } from "./scrapers/cobertura_saude_bucal.js";
import { scrapeCoberturaAcs } from "./scrapers/cobertura_acs.js";
import { scrapeMapasSus } from "./scrapers/mapas_sus.js";
import { scrapeHistoricoPagamentoIndex } from "./scrapers/historico_pagamento_index.js";
import { scrapeAdesaoPse } from "./scrapers/adesao_pse.js";
import { scrapeListagemSaudeComAgente } from "./scrapers/listagem_saude_com_agente.js";
import { scrapeSisab } from "./scrapers/sisab.js";
import { scrapeTria } from "./scrapers/tria.js";
import { scrapeInformatizaAps } from "./scrapers/informatiza_aps.js";
import { scrapeRelPagamentoPmaq } from "./scrapers/rel_pagamento_pmaq.js";
import { scrapeSaudeHora } from "./scrapers/saude_hora.js";
import { scrapeSiapsPublico } from "./scrapers/siaps_publico.js";
import { scrapePraticasAssistenciais } from "./scrapers/praticas_assistenciais.js";
import { formatError } from "./downloader.js";

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
                .replaceAll(/\s+/g, "-");
            log.info(`Processando módulo: ${moduleName}`);

            for (const link of module.links) {
                try {
                    log.info(`[${moduleName}] Processando link: ${link}`);
                    if (link.includes('ausencia-envio-producao')) {
                        await scrapeAusenciaEnvioProducao(page, moduleName, link);
                    } else if (link.includes('pagamento')) {
                        await scrapePagamento(page, moduleName, link);
                    } else if (link.includes('ines-cnes-homologados')) {
                        await scrapeInesCnesHomologados(page, moduleName, link);
                    } else if (link.includes('relatorio-solicitacoes')) {
                        await scrapeRelatorioSolicitacoes(page, moduleName, link);
                    } else if (link.includes('solicitacoes-adesao')) {
                        await scrapeSolicitacoesAdesao(page, moduleName, link);
                    } else if (link.includes('outros-incentivos')) {
                        await scrapeOutrosIncentivos(page, moduleName, link);
                    } else if (link.includes('cobertura/aps')) {
                        await scrapeCoberturaAps(page, moduleName, link);
                    } else if (link.includes('cobertura/saude-bucal')) {
                        await scrapeCoberturaSaudeBucal(page, moduleName, link);
                    } else if (link.includes('cobertura/acs')) {
                        await scrapeCoberturaAcs(page, moduleName, link);
                    } else if (link.includes('mapas.sus.c3sl.ufpr.br')) {
                        await scrapeMapasSus(page, moduleName, link);
                    } else if (link.includes('relHistoricoPagamentoIndex')) {
                        await scrapeHistoricoPagamentoIndex(page, moduleName, link);
                    } else if (link.includes('adesao/pse')) {
                        await scrapeAdesaoPse(page, moduleName, link);
                    } else if (link.includes('listagem-saude-com-agente')) {
                        await scrapeListagemSaudeComAgente(page, moduleName, link);
                    } else if (link.includes('sisab.saude.gov.br')) {
                        await scrapeSisab(page, moduleName, link);
                    } else if (link.includes('tria')) {
                        await scrapeTria(page, moduleName, link);
                    } else if (link.includes('informatiza-aps')) {
                        await scrapeInformatizaAps(page, moduleName, link);
                    } else if (link.includes('relPagamentoPmaq')) {
                        await scrapeRelPagamentoPmaq(page, moduleName, link);
                    } else if (link.includes('saude-hora')) {
                        await scrapeSaudeHora(page, moduleName, link);
                    } else if (link.includes('praticas-assistenciais')) {
                        await scrapePraticasAssistenciais(page, moduleName, link);
                    } else if (link.includes('siaps.saude.gov.br')) {
                        await scrapeSiapsPublico(page, moduleName, link);
                    } else {
                        log.info(`Link não mapeado para scraper específico: ${link}`);
                    }
                } catch (linkError) {
                    log.error({ data: formatError(linkError) }, `Erro ao processar o link [${link}] do módulo [${moduleName}]. Continuando para os próximos...`);
                }
            }
        }

        log.info('Processo global de scraping e downloads finalizado com sucesso!');
    } finally {
        await browser.close();
    }
}