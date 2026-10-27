// src/downloader.ts
import { Page, CDPSession, HTTPResponse } from "puppeteer";
import * as fs from "fs";
import * as path from "path";
import { new_logger } from "./services/logs.js";

const logger = new_logger(import.meta.url);

function errMsg(e: unknown): string {
    return e instanceof Error ? `${e.name}: ${e.message}` : String(e);
}

function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

interface DownloadState {
    pageClient: CDPSession;
    browserClient: CDPSession;
    browserContextId?: string;
    downloadPath: string;
}

/** Aponta a pasta de download do Chrome (nível de página e de browser/contexto). */
async function applyDownloadDir(state: DownloadState, dir: string, log: { warn: (m: string) => void }): Promise<void> {
    await state.pageClient.send('Page.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: dir,
    }).catch((e) => log.warn(`Page.setDownloadBehavior falhou: ${errMsg(e)}`));

    await state.browserClient.send('Browser.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: dir,
        eventsEnabled: true,
        ...(state.browserContextId ? { browserContextId: state.browserContextId } : {}),
    }).catch((e) => log.warn(`Browser.setDownloadBehavior falhou: ${errMsg(e)}`));
}

// Sessão CDP de nível de browser (por página), usada para ouvir os eventos de download.
const downloadStates = new WeakMap<Page, DownloadState>();

export async function setupDownloadBehavior(page: Page, downloadPath: string): Promise<void> {
    const log = logger.forMethod('setupDownloadBehavior');
    const absPath = path.resolve(downloadPath);

    if (!fs.existsSync(absPath)) {
        fs.mkdirSync(absPath, { recursive: true });
    }

    // Configuração para versões mais antigas do Puppeteer/Chrome
    const pageClient = await page.target().createCDPSession();

    // Configuração necessária para o novo modo Headless (Chrome 112+).
    // Se a página estiver em um BrowserContext não-padrão (incógnito), o comportamento precisa
    // ser aplicado a ESSE contexto; do contrário o Chrome salva na pasta Downloads padrão.
    const browserClient = await page.browser().target().createCDPSession();
    const ctx: any = typeof (page as any).browserContext === 'function' ? (page as any).browserContext() : undefined;
    const browserContextId: string | undefined = ctx?.id;

    const state: DownloadState = { pageClient, browserClient, browserContextId, downloadPath: absPath };
    await applyDownloadDir(state, absPath, log);
    downloadStates.set(page, state);
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

                    try {
                        fs.renameSync(oldPath, newPath);
                        return;
                    } catch (error) {
                        // Se gerar erro (ex: EBUSY), o arquivo ainda está sendo escrito/bloqueado pelo navegador.
                        // Ignora a falha para tentar renomear novamente no próximo ciclo (1 segundo).
                    }
                }
            }
        }
        await new Promise(r => setTimeout(r, 1000));
    }
    throw new Error(`Timeout de ${timeout}ms aguardando o download concluir.`);
}

// ---------------------------------------------------------------------------
// Download orientado a eventos
// ---------------------------------------------------------------------------

export interface TriggerDownloadOptions {
    downloadPath: string;
    /** Nome final (sem extensão). A extensão vem do arquivo baixado. */
    fileName: string;
    /** Ação que dispara o download (ex.: clique no botão). Executada DEPOIS dos listeners. */
    trigger: () => Promise<void>;
    /** Tempo máximo para o Chrome sinalizar o início do download. Padrão: 30s. */
    startTimeout?: number;
    /** Tempo máximo para o download concluir depois de iniciado. Padrão: 180s. */
    finishTimeout?: number;
}

interface CapturedResponse {
    url: string;
    status: number;
    ext: string;
    body: Promise<Buffer>;
}

function guessExtension(contentType: string, contentDisposition: string): string {
    const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(contentDisposition);
    if (m) {
        let name = m[1];
        try { name = decodeURIComponent(name); } catch { /* mantém o nome cru */ }
        const ext = path.extname(name);
        if (ext) return ext;
    }
    if (/spreadsheetml/.test(contentType)) return '.xlsx';
    if (/ms-excel/.test(contentType)) return '.xls';
    if (/csv/.test(contentType)) return '.csv';
    if (/zip/.test(contentType)) return '.zip';
    return '.bin';
}

async function collectDiagnostics(page: Page): Promise<string> {
    try {
        const info = await page.evaluate(() => {
            const form = document.querySelector('app-formulario-cobertura form');
            const btn = document.querySelector<HTMLButtonElement>('button[aria-label="Download"]');
            return {
                formInvalid: form ? form.classList.contains('ng-invalid') : null,
                btnDisabled: btn ? btn.disabled : null,
                toasts: Array.from(document.querySelectorAll('.p-toast-message'))
                    .map((e) => (e.textContent || '').trim())
                    .filter(Boolean),
                url: location.href,
            };
        });
        return JSON.stringify(info);
    } catch (e) {
        return `diagnóstico indisponível (${errMsg(e)})`;
    }
}

/**
 * Dispara um download e aguarda sua conclusão usando os eventos do Chrome
 * (Browser.downloadWillBegin / Browser.downloadProgress), sem depender de comparar a pasta.
 *
 * Plano B: se o Chrome não iniciar (ou cancelar) o download, usa a resposta HTTP do próprio
 * arquivo (capturada via Puppeteer) e grava em disco.
 *
 * Retorna o caminho do arquivo salvo.
 */
export async function triggerDownloadAndSave(page: Page, opts: TriggerDownloadOptions): Promise<string> {
    const log = logger.forMethod('triggerDownloadAndSave');
    const state = downloadStates.get(page);
    if (!state) {
        throw new Error('setupDownloadBehavior não foi chamado para esta página.');
    }

    const downloadPath = path.resolve(opts.downloadPath);
    const startTimeout = opts.startTimeout ?? 30000;
    const finishTimeout = opts.finishTimeout ?? 180000;

    // Cada download vai para uma subpasta temporária VAZIA. Assim:
    //  - não há colisão de nomes: com 'allow', o Chrome SOBRESCREVE em silêncio um arquivo de mesmo
    //    nome já existente (o site usa nome fixo por dia, ex.: cobertura-aps-27-10-2026.xlsx), e
    //    comparar "arquivos novos" na pasta não enxerga nada;
    //  - o arquivo baixado é, por construção, o único que aparece na subpasta.
    const tmpDir = path.join(downloadPath, `.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    await applyDownloadDir(state, tmpDir, log);

    // 'as' evita que o TS estreite para "idle" (o valor é alterado dentro dos callbacks abaixo)
    let status = 'idle' as 'idle' | 'started' | 'completed' | 'canceled';
    let guid: string | undefined;
    let suggestedFilename = '';
    let receivedBytes = 0;

    const captured: CapturedResponse[] = [];
    let capturedAt = 0;
    const recentRequests: string[] = [];

    const onBegin = (e: { guid: string; url: string; suggestedFilename: string }) => {
        if (guid) return;
        guid = e.guid;
        suggestedFilename = e.suggestedFilename;
        status = 'started';
        log.info(`[${opts.fileName}] Chrome iniciou o download: ${e.suggestedFilename}`);
    };

    const onProgress = (e: { guid: string; state: string; receivedBytes: number }) => {
        if (e.guid !== guid) return;
        receivedBytes = e.receivedBytes;
        if (e.state === 'completed') status = 'completed';
        else if (e.state === 'canceled') status = 'canceled';
    };

    const onResponse = (res: HTTPResponse) => {
        const req = res.request();
        const type = req.resourceType();
        if (type !== 'xhr' && type !== 'fetch' && type !== 'document') return;

        if (recentRequests.length >= 10) recentRequests.shift();
        recentRequests.push(`${req.method()} ${res.status()} ${res.url()}`);

        const h = res.headers();
        const ct = (h['content-type'] || '').toLowerCase();
        const cd = h['content-disposition'] || '';
        const looksLikeFile = /attachment|filename=/i.test(cd) || /spreadsheet|excel|octet-stream|zip|csv/.test(ct);
        if (!looksLikeFile || !res.ok()) return;

        const body = res.buffer();
        body.catch(() => { });
        captured.push({ url: res.url(), status: res.status(), ext: guessExtension(ct, cd), body });
        if (!capturedAt) capturedAt = Date.now();
    };

    state.browserClient.on('Browser.downloadWillBegin', onBegin);
    state.browserClient.on('Browser.downloadProgress', onProgress);
    page.on('response', onResponse);

    try {
        await opts.trigger();

        // Fase 1: esperar o Chrome sinalizar o início do download
        const t0 = Date.now();
        while (status === 'idle') {
            if (Date.now() - t0 > startTimeout) break;
            // Já temos o arquivo na resposta HTTP e o Chrome continua mudo há 5s: não vale esperar mais.
            if (capturedAt && Date.now() - capturedAt > 5000) break;
            await sleep(250);
        }

        // Fase 2: acompanhar o download até o fim
        if (status === 'started') {
            const t1 = Date.now();
            while (status === 'started' && Date.now() - t1 < finishTimeout) {
                await sleep(250);
            }
            if (status === 'started') {
                log.warn(`[${opts.fileName}] Download iniciado mas não concluiu em ${finishTimeout}ms (${receivedBytes} bytes recebidos).`);
            }
        }

        if (status === 'completed') {
            // A subpasta temporária só contém o arquivo deste download
            const t2 = Date.now();
            while (Date.now() - t2 < 10000) {
                const chosen = getFilesInDir(tmpDir).find((f) => !f.endsWith('.crdownload') && !f.endsWith('.tmp'));

                if (chosen) {
                    const ext = path.extname(chosen) || path.extname(suggestedFilename);
                    const dest = path.join(downloadPath, `${opts.fileName}${ext}`);
                    try {
                        fs.renameSync(path.join(tmpDir, chosen), dest); // sobrescreve versão anterior, se houver
                        return dest;
                    } catch {
                        // EBUSY etc.: tenta de novo no próximo ciclo
                    }
                }
                await sleep(500);
            }
            throw new Error(
                `Chrome reportou download concluído (${suggestedFilename}) mas nenhum arquivo apareceu em ${tmpDir}. ` +
                `Verifique se a pasta de download configurada é a mesma do contexto da página.`
            );
        }

        // Plano B: o Chrome não baixou (não iniciou / cancelou / travou) mas a resposta HTTP veio
        if (captured.length > 0) {
            const c = captured[0];
            log.warn(`[${opts.fileName}] Download do Chrome indisponível (status=${status}); salvando a resposta HTTP de ${c.url}.`);
            const buf = await c.body;
            const dest = path.join(downloadPath, `${opts.fileName}${c.ext}`);
            fs.writeFileSync(dest, buf);
            return dest;
        }

        const diag = await collectDiagnostics(page);
        throw new Error(
            `Nenhum download ocorreu (status=${status}, ${receivedBytes} bytes). ` +
            `Requisições recentes: [${recentRequests.join(' | ')}]. Página: ${diag}`
        );
    } finally {
        state.browserClient.off('Browser.downloadWillBegin', onBegin);
        state.browserClient.off('Browser.downloadProgress', onProgress);
        page.off('response', onResponse);

        // Restaura a pasta principal (usada por waitForNewDownloadAndRename em outros scrapers)
        await applyDownloadDir(state, downloadPath, log);
        try {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch (e) {
            log.warn(`Não foi possível remover ${tmpDir}: ${errMsg(e)}`);
        }
    }
}