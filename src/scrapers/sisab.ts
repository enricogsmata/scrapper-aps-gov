// src/scrapers/sisab.ts
import { Page } from "puppeteer";
import * as path from "path";
import { new_logger } from "../services/logs.js";
import { formatError } from "../downloader.js";
import { scrapeSisabValidacao } from "./sisab_validacao.js";
import { scrapeSisabIndicadorPainel } from "./sisab_indicador_painel.js";
import { scrapeSisabIndicadorCadastro } from "./sisab_indicador_cadastro.js";
import { scrapeSisabProducao } from "./sisab_producao.js";
import { scrapeSisabPrenatal } from "./sisab_prenatal.js";
import { scrapeSisabAtivColetiva } from "./sisab_ativ_coletiva.js";
import { scrapeSisabDocumentos } from "./sisab_documentos.js";

const logger = new_logger(import.meta.url);

export async function scrapeSisab(page: Page, moduleName: string, targetUrl: string): Promise<void> {
    const log = logger.forMethod('scrapeSisab');
    const downloadPath = path.resolve(process.cwd(), 'downloads', moduleName);

    log.info(`Navegando para o portal SISAB: ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'networkidle2' });

    const reportLinks = await page.$$eval('.box-body a.text-blank, .box-body a.text-yellow', (els) => {
        return els.map(a => (a as HTMLAnchorElement).href);
    });

    log.info(`Encontrados ${reportLinks.length} relatórios disponíveis no SISAB.`);

    for (const link of reportLinks) {
        const subPage = await page.browser().newPage();
        try {
            if (link.includes('RelValidacao.xhtml')) {
                //await scrapeSisabValidacao(subPage, downloadPath, link);
            } else if (link.includes('indicadorPainel.xhtml')) {
                //await scrapeSisabIndicadorPainel(subPage, downloadPath, link);
            } else if (link.includes('indicadorCadastro.xhtml')) {
                await scrapeSisabIndicadorCadastro(subPage, downloadPath, link);
            } else if (link.includes('RelSauProducao.xhtml')) {
                //await scrapeSisabProducao(subPage, downloadPath, link);
            } else if (link.includes('IndicadorPrenatal.xhtml')) {
                await scrapeSisabPrenatal(subPage, downloadPath, link);
            } else if (link.includes('RelSauAtivColetiva.xhtml')) {
                await scrapeSisabAtivColetiva(subPage, downloadPath, link);
            } else if (link.includes('IndexDocumentos.xhtml')) {
                await scrapeSisabDocumentos(subPage, downloadPath, link);
            } else {
                log.info(`Página pendente de mapeamento no SISAB: ${link}`);
            }
        } catch (error) {
            log.error({ data: formatError(error) }, `Erro ao processar relatório do SISAB (${link}). Prosseguindo para os próximos relatórios...`);
        } finally {
            await subPage.close().catch(() => {});
        }
    }

    log.info('Processamento concluído para: SISAB.');
}