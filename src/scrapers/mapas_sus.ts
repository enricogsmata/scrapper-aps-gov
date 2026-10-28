// src/scrapers/mapas_sus.ts
import { Page } from "puppeteer";
import * as path from "path";
import { new_logger } from "../services/logs.js";
import { safeDownloadFromUrl, formatError } from "../downloader.js";

const logger = new_logger(import.meta.url);

const RAW_GPKG_URL = "https://raw.githubusercontent.com/ms-deaps/mapas/main/shapes/unidades_cnes_realocadas.gpkg";
const TARGET_FILENAME = "unidades_cnes_realocadas.gpkg";

export async function scrapeMapasSus(page: Page, moduleName: string, targetUrl: string): Promise<void> {
    const log = logger.forMethod('scrapeMapasSus');

    const downloadPath = path.resolve(process.cwd(), 'downloads', moduleName, 'mapas-sus');
    const filePath = path.join(downloadPath, TARGET_FILENAME);

    log.info(`Iniciando download seguro do shapefile via raw GitHub: ${RAW_GPKG_URL}`);

    try {
        await safeDownloadFromUrl(RAW_GPKG_URL, filePath, {
            retries: 3,
            retryDelayMs: 3000,
            skipIfExists: true
        });
        log.info(`Arquivo gravado com sucesso em: ${filePath}`);
    } catch (error) {
        log.error({ data: formatError(error) }, `Falha ao baixar o arquivo GPKG:`);
    }
}