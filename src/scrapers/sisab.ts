// src/scrapers/sisab.ts
import { Page } from "puppeteer";
import * as path from "path";
import { new_logger } from "../services/logs.js";
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

    for (const link of reportLinks) {
        if (link.includes('RelValidacao.xhtml')) {
            const subPage = await page.browser().newPage();
            try {
                await scrapeSisabValidacao(subPage, downloadPath, link);
            } finally {
                await subPage.close();
            }
        } else if (link.includes('indicadorPainel.xhtml')) {
            const subPage = await page.browser().newPage();
            try {
                await scrapeSisabIndicadorPainel(subPage, downloadPath, link);
            } finally {
                await subPage.close();
            }
        } else if (link.includes('indicadorCadastro.xhtml')) {
            const subPage = await page.browser().newPage();
            try {
                await scrapeSisabIndicadorCadastro(subPage, downloadPath, link);
            } finally {
                await subPage.close();
            }
        } else if (link.includes('RelSauProducao.xhtml')) {
            const subPage = await page.browser().newPage();
            try {
                await scrapeSisabProducao(subPage, downloadPath, link);
            } finally {
                await subPage.close();
            }
        } else if (link.includes('IndicadorPrenatal.xhtml')) {
            const subPage = await page.browser().newPage();
            try {
                await scrapeSisabPrenatal(subPage, downloadPath, link);
            } finally {
                await subPage.close();
            }
        } else if (link.includes('RelSauAtivColetiva.xhtml')) {
            const subPage = await page.browser().newPage();
            try {
                await scrapeSisabAtivColetiva(subPage, downloadPath, link);
            } finally {
                await subPage.close();
            }
        } else if (link.includes('IndexDocumentos.xhtml')) {
            const subPage = await page.browser().newPage();
            try {
                await scrapeSisabDocumentos(subPage, downloadPath, link);
            } finally {
                await subPage.close();
            }
        } else {
            log.info(`Página pendente de mapeamento no SISAB: ${link}`);
        }
    }

    log.info('Processamento inicial concluído para: SISAB.');
}