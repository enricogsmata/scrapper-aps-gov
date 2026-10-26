// src/scrapers/mapas_sus.ts
import { Page } from "puppeteer";
import * as path from "path";
import * as fs from "fs";
import { new_logger } from "../services/logs.js";

const logger = new_logger(import.meta.url);

const RAW_GPKG_URL = "https://raw.githubusercontent.com/ms-deaps/mapas/main/shapes/unidades_cnes_realocadas.gpkg";
const TARGET_FILENAME = "unidades_cnes_realocadas.gpkg";

export async function scrapeMapasSus(page: Page, moduleName: string, targetUrl: string): Promise<void> {
    const log = logger.forMethod('scrapeMapasSus');

    const downloadPath = path.resolve(process.cwd(), 'downloads', moduleName, 'mapas-sus');
    if (!fs.existsSync(downloadPath)) {
        fs.mkdirSync(downloadPath, { recursive: true });
    }

    const filePath = path.join(downloadPath, TARGET_FILENAME);

    log.info(`Iniciando download direto do shapefile via raw GitHub: ${RAW_GPKG_URL}`);

    try {
        const response = await fetch(RAW_GPKG_URL);

        if (!response.ok) {
            throw new Error(`Falha no download via HTTP ${response.status}: ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        fs.writeFileSync(filePath, buffer);
        log.info(`Arquivo gravado com sucesso em: ${filePath}`);
    } catch (error) {
        log.error({ data: JSON.stringify(error, null, 4) }, `Falha ao baixar o arquivo GPKG:`);
    }
}