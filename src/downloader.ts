// src/downloader.ts
import { Page } from "puppeteer";
import * as fs from "fs";
import * as path from "path";

export async function setupDownloadBehavior(page: Page, downloadPath: string): Promise<void> {
    if (!fs.existsSync(downloadPath)) {
        fs.mkdirSync(downloadPath, { recursive: true });
    }

    // Configuração para versões mais antigas do Puppeteer/Chrome
    const pageClient = await page.target().createCDPSession();
    await pageClient.send('Page.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: downloadPath,
    }).catch(() => { });

    // Configuração necessária para o novo modo Headless (Chrome 112+)
    const browserClient = await page.browser().target().createCDPSession();
    await browserClient.send('Browser.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: downloadPath,
        eventsEnabled: true
    }).catch(() => { });
}

export function getFilesInDir(dir: string): string[] {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir);
}

export async function waitForNewDownloadAndRename(downloadPath: string, filesBefore: string[], newFileName: string, timeout: number = 60000): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
        const currentFiles = fs.readdirSync(downloadPath);
        const newFiles = currentFiles.filter(f => !filesBefore.includes(f));

        if (newFiles.length > 0) {
            const isDownloading = newFiles.some(f => f.endsWith('.crdownload') || f.endsWith('.tmp'));
            if (!isDownloading) {
                const downloadedFile = newFiles.find(f => !f.endsWith('.crdownload') && !f.endsWith('.tmp'));
                if (downloadedFile) {
                    const oldPath = path.join(downloadPath, downloadedFile);
                    const extension = path.extname(downloadedFile);
                    const newPath = path.join(downloadPath, `${newFileName}${extension}`);
                    fs.renameSync(oldPath, newPath);
                    return;
                }
            }
        }
        await new Promise(r => setTimeout(r, 1000));
    }
    throw new Error(`Timeout de ${timeout}ms aguardando o download concluir.`);
}