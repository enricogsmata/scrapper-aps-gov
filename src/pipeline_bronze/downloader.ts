// src/downloader.ts
import { Page, CDPSession, HTTPResponse, ElementHandle } from "puppeteer";
import * as fs from "fs";
import * as path from "path";
import { new_logger } from "../services/logs.js";

const logger = new_logger(import.meta.url);

/**
 * Formata um erro de forma segura e completa para logs e diagnósticos,
 * contornando a limitação do JSON.stringify(new Error) que gera "{}".
 */
export function formatError(e: unknown): string {
    if (e instanceof Error) {
        return `${e.name}: ${e.message}${e.stack ? `\nStack: ${e.stack}` : ''}`;
    }
    return String(e);
}

export function errMsg(e: unknown): string {
    return e instanceof Error ? `${e.name}: ${e.message}` : String(e);
}

export function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

export interface PageStatusFeedback {
    hasError: boolean;
    hasWarning: boolean;
    hasNoData: boolean;
    messages: string[];
    formInvalid?: boolean;
    btnDisabled?: boolean;
}

/**
 * Analisa a interface da página em busca de toasts do PrimeNG, alertas ou avisos
 * que indicam que a consulta falhou ou não retornou dados para a combinação.
 */
export async function checkPageFeedback(page: Page): Promise<PageStatusFeedback> {
    try {
        return await page.evaluate(() => {
            const toastEls = Array.from(document.querySelectorAll(
                '.p-toast-message, .p-message, .alert, .ui-messages, .message-error, .toast-body, .ui-growl-message'
            ));
            const messages = toastEls.map((el) => (el.textContent || '').trim()).filter(Boolean);

            const isNoData = messages.some((t) =>
                /nenhum registro|não foram encontrados|sem dados|nenhum dado|dados não encontrados|não há dados/i.test(t)
            );
            const isError = messages.some((t) =>
                /erro|falha|indispon[íi]vel|ocorreu um erro|tente novamente|exception|timeout/i.test(t)
            );
            const isWarning = messages.some((t) =>
                /atenção|aviso|alerta/i.test(t)
            );

            const form = document.querySelector('form.ng-invalid, form.ui-state-error');
            const btnDownload = document.querySelector<HTMLButtonElement>(
                'button[aria-label="Download"], app-botao-download-excel button, download-button button, input[type="submit"][id*="Download"]'
            );

            return {
                hasError: isError,
                hasWarning: isWarning,
                hasNoData: isNoData,
                messages,
                formInvalid: Boolean(form),
                btnDisabled: btnDownload ? (btnDownload.disabled || btnDownload.classList.contains('p-disabled') || btnDownload.hasAttribute('disabled')) : undefined
            };
        });
    } catch {
        return { hasError: false, hasWarning: false, hasNoData: false, messages: [] };
    }
}

/**
 * Verifica se um arquivo salvo é íntegro:
 * - Deve existir
 * - Deve ter tamanho > 0 bytes
 * - Não deve ser uma página HTML de erro salva com extensão de planilha
 */
export function isValidDownloadedFile(filePath: string): boolean {
    if (!fs.existsSync(filePath)) return false;
    try {
        const stat = fs.statSync(filePath);
        if (stat.size === 0) return false;

        // Se for um arquivo de texto pequeno (< 1KB), verificar se é resposta de erro HTML 500 do servidor
        if (stat.size < 1024) {
            try {
                const head = fs.readFileSync(filePath, { encoding: 'utf-8' }).slice(0, 300).toLowerCase();
                if (
                    head.includes('internal server error') ||
                    head.includes('erro interno') ||
                    (head.includes('<html') && (head.includes('erro') || head.includes('500') || head.includes('503')))
                ) {
                    return false;
                }
            } catch {
                // Arquivos binários reais podem não decodificar utf-8 sem lançar nada ou com caracteres especiais
            }
        }
        return true;
    } catch {
        return false;
    }
}

/**
 * Verifica se já existe um arquivo baixado válido no diretório para o prefixo especificado.
 */
export function hasValidDownloadedFile(downloadPath: string, fileName: string): string | null {
    if (!fs.existsSync(downloadPath)) return null;
    try {
        const files = fs.readdirSync(downloadPath);
        const match = files.find((f) => {
            const base = path.parse(f).name;
            const ext = path.extname(f);
            return base === fileName && !ext.endsWith('.crdownload') && !ext.endsWith('.tmp') && ext !== '';
        });
        if (match) {
            const full = path.join(downloadPath, match);
            if (isValidDownloadedFile(full)) return full;
        }
    } catch {
        // Ignora erros de leitura de diretório
    }
    return null;
}

/**
 * Clica com segurança em um elemento usando coordenadas reais do mouse (Puppeteer),
 * após garantir que esteja visível e centralizado no viewport.
 */
export async function realClick(page: Page, selectorOrHandle: string | ElementHandle): Promise<void> {
    const handle = typeof selectorOrHandle === 'string'
        ? await page.waitForSelector(selectorOrHandle, { visible: true, timeout: 15000 })
        : selectorOrHandle;

    if (!handle) throw new Error(`Elemento não encontrado para clique: ${selectorOrHandle}`);

    await handle.evaluate((el) => {
        (el as HTMLElement).scrollIntoView({ behavior: 'instant', block: 'center' });
    });
    await sleep(400);
    await handle.click();
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

    const pageClient = await page.target().createCDPSession();
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

/**
 * Aguarda um novo download e renomeia o arquivo.
 * Inclui proteções contra:
 * - Arquivos de mesmo nome que já existiam (identificação por modificação recente)
 * - Bloqueio EBUSY no Windows durante escrita do navegador
 * - Validação de tamanho > 0 bytes
 */
export async function waitForNewDownloadAndRename(
    downloadPath: string,
    filesBefore: string[],
    newFileName: string,
    timeout: number = 60000
): Promise<string> {
    const startTime = Date.now();
    const initialFilesSet = new Set(filesBefore);

    while (Date.now() - startTime < timeout) {
        if (!fs.existsSync(downloadPath)) {
            await sleep(500);
            continue;
        }

        const currentFiles = fs.readdirSync(downloadPath);
        // Arquivos novos que não estavam no snapshot inicial
        const newFiles = currentFiles.filter((f) => !initialFilesSet.has(f));

        // Se nenhum arquivo novo apareceu, verificar se algum arquivo existente foi modificado recentemente
        let candidate = newFiles.find((f) => !f.endsWith('.crdownload') && !f.endsWith('.tmp'));

        if (!candidate && newFiles.length === 0) {
            // Verifica arquivos modificados após o início da chamada
            const modified = currentFiles.filter((f) => {
                if (f.endsWith('.crdownload') || f.endsWith('.tmp')) return false;
                try {
                    const stats = fs.statSync(path.join(downloadPath, f));
                    return stats.mtimeMs >= startTime - 1000;
                } catch {
                    return false;
                }
            });
            if (modified.length > 0) {
                candidate = modified[0];
            }
        }

        if (candidate) {
            const oldPath = path.join(downloadPath, candidate);
            const extension = path.extname(candidate);
            const newPath = path.join(downloadPath, `${newFileName}${extension}`);

            // Certifica de que não é um arquivo temporário em escrita
            const isStillWriting = currentFiles.some(
                (f) => f.startsWith(candidate!) && (f.endsWith('.crdownload') || f.endsWith('.tmp'))
            );

            if (!isStillWriting) {
                try {
                    // Se o arquivo tiver tamanho > 0 e não estiver bloqueado
                    if (isValidDownloadedFile(oldPath)) {
                        if (oldPath !== newPath) {
                            fs.renameSync(oldPath, newPath);
                        }
                        return newPath;
                    }
                } catch {
                    // EBUSY etc.: o Chrome ainda pode estar liberando o handle do arquivo
                }
            }
        }

        await sleep(750);
    }

    throw new Error(`Timeout de ${timeout}ms aguardando o download concluir em ${downloadPath}.`);
}

// ---------------------------------------------------------------------------
// Download orientado a eventos com retries e tolerância a falhas
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
    /** Quantidade de retries em caso de falha transitória. Padrão: 2 (total 3 tentativas). */
    retries?: number;
    /** Intervalo inicial entre retries em ms. Padrão: 3000ms. */
    retryDelayMs?: number;
    /** Se true e já existe arquivo válido com o mesmo nome na pasta, pula o download. */
    skipIfExists?: boolean;
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
    if (/json/.test(contentType)) return '.json';
    return '.bin';
}

async function collectDiagnostics(page: Page): Promise<string> {
    try {
        const feedback = await checkPageFeedback(page);
        const url = page.url();
        return JSON.stringify({ ...feedback, url });
    } catch (e) {
        return `diagnóstico indisponível (${errMsg(e)})`;
    }
}

/**
 * Executa uma tentativa única de disparo de download via eventos do Chrome + fallback HTTP.
 */
async function executeSingleDownloadAttempt(
    page: Page,
    state: DownloadState,
    opts: TriggerDownloadOptions
): Promise<string> {
    const log = logger.forMethod('triggerDownloadAndSave:attempt');
    const downloadPath = path.resolve(opts.downloadPath);
    const startTimeout = opts.startTimeout ?? 30000;
    const finishTimeout = opts.finishTimeout ?? 180000;

    // Subpasta temporária isolada para evitar colisão e permitir identificação precisa
    const tmpDir = path.join(downloadPath, `.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    await applyDownloadDir(state, tmpDir, log);

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
            if (capturedAt && Date.now() - capturedAt > 5000) break;

            // Checar se apareceu mensagem de erro ou sem dados na tela
            if (Date.now() - t0 > 3000) {
                const feedback = await checkPageFeedback(page);
                if (feedback.hasNoData) {
                    throw new Error(`[NO_DATA] Servidor informou ausência de dados: ${feedback.messages.join(' | ')}`);
                }
            }
            await sleep(250);
        }

        // Fase 2: acompanhar o download até o fim
        if (status === 'started') {
            const t1 = Date.now();
            while (status === 'started' && Date.now() - t1 < finishTimeout) {
                await sleep(250);
            }
            if (status === 'started') {
                log.warn(`[${opts.fileName}] Download iniciado mas não concluiu em ${finishTimeout}ms (${receivedBytes} bytes).`);
            }
        }

        if (status === 'completed') {
            const t2 = Date.now();
            while (Date.now() - t2 < 10000) {
                const chosen = getFilesInDir(tmpDir).find((f) => !f.endsWith('.crdownload') && !f.endsWith('.tmp'));

                if (chosen) {
                    const tempFilePath = path.join(tmpDir, chosen);
                    if (isValidDownloadedFile(tempFilePath)) {
                        const ext = path.extname(chosen) || path.extname(suggestedFilename);
                        const dest = path.join(downloadPath, `${opts.fileName}${ext}`);
                        try {
                            fs.renameSync(tempFilePath, dest);
                            return dest;
                        } catch {
                            // EBUSY etc.: tenta no próximo ciclo
                        }
                    }
                }
                await sleep(500);
            }
            throw new Error(`Chrome reportou download concluído mas arquivo inválido ou não encontrado em ${tmpDir}.`);
        }

        // Plano B: o Chrome não baixou mas a resposta HTTP veio íntegra
        if (captured.length > 0) {
            const c = captured[0];
            log.warn(`[${opts.fileName}] Download do Chrome indisponível (status=${status}); salvando via resposta HTTP de ${c.url}.`);
            const buf = await c.body;
            if (buf && buf.length > 0) {
                const dest = path.join(downloadPath, `${opts.fileName}${c.ext}`);
                fs.writeFileSync(dest, buf);
                if (isValidDownloadedFile(dest)) {
                    return dest;
                }
            }
        }

        const diag = await collectDiagnostics(page);
        throw new Error(
            `Nenhum download ocorreu (status=${status}, ${receivedBytes} bytes). ` +
            `Requisições: [${recentRequests.join(' | ')}]. Página: ${diag}`
        );
    } finally {
        state.browserClient.off('Browser.downloadWillBegin', onBegin);
        state.browserClient.off('Browser.downloadProgress', onProgress);
        page.off('response', onResponse);

        await applyDownloadDir(state, downloadPath, log);
        try {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch {
            // Ignora falha de remoção temporária
        }
    }
}

/**
 * Dispara um download e aguarda sua conclusão com retries automáticos,
 * prevenção contra perda de dados e verificação de integridade.
 */
export async function triggerDownloadAndSave(page: Page, opts: TriggerDownloadOptions): Promise<string> {
    const log = logger.forMethod('triggerDownloadAndSave');
    const state = downloadStates.get(page);
    if (!state) {
        throw new Error('setupDownloadBehavior não foi chamado para esta página.');
    }

    const downloadPath = path.resolve(opts.downloadPath);
    if (opts.skipIfExists) {
        const existing = hasValidDownloadedFile(downloadPath, opts.fileName);
        if (existing) {
            log.info(`[${opts.fileName}] Arquivo já existente e válido: ${path.basename(existing)}. Download pulado.`);
            return existing;
        }
    }

    const maxRetries = opts.retries ?? 2;
    const retryDelay = opts.retryDelayMs ?? 3000;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
        try {
            if (attempt > 1) {
                log.info(`[${opts.fileName}] Tentativa ${attempt}/${maxRetries + 1} de download...`);
            }
            const savedPath = await executeSingleDownloadAttempt(page, state, opts);
            if (isValidDownloadedFile(savedPath)) {
                return savedPath;
            }
            throw new Error(`Arquivo gerado em ${savedPath} está vazio ou corrompido.`);
        } catch (error) {
            lastError = error;
            const msg = errMsg(error);

            // Se o servidor explicitamente confirmou ausência de dados, não vale fazer retry
            if (msg.includes('[NO_DATA]')) {
                log.warn(`[${opts.fileName}] Consulta sem dados no servidor governamental: ${msg}`);
                throw error;
            }

            log.warn(`[${opts.fileName}] Falha na tentativa ${attempt}/${maxRetries + 1}: ${msg}`);

            if (attempt <= maxRetries) {
                const waitTime = retryDelay * attempt;
                log.info(`[${opts.fileName}] Aguardando ${waitTime}ms antes da próxima tentativa...`);
                await sleep(waitTime);
            }
        }
    }

    throw new Error(
        `Falha ao realizar download de [${opts.fileName}] após ${maxRetries + 1} tentativas: ${formatError(lastError)}`
    );
}

// ---------------------------------------------------------------------------
// Download por clique com retries
// ---------------------------------------------------------------------------

export interface DownloadByClickOptions {
    /** Seletor CSS do botão de download. */
    selector: string;
    downloadPath: string;
    /** Nome final (sem extensão). */
    fileName: string;
    startTimeout?: number;
    finishTimeout?: number;
    retries?: number;
    retryDelayMs?: number;
    skipIfExists?: boolean;
}

export async function downloadByClick(page: Page, opts: DownloadByClickOptions): Promise<string> {
    return triggerDownloadAndSave(page, {
        downloadPath: opts.downloadPath,
        fileName: opts.fileName,
        startTimeout: opts.startTimeout,
        finishTimeout: opts.finishTimeout,
        retries: opts.retries,
        retryDelayMs: opts.retryDelayMs,
        skipIfExists: opts.skipIfExists,
        trigger: async () => {
            await realClick(page, opts.selector);
        },
    });
}

// ---------------------------------------------------------------------------
// Download direto de URLs (arquivos estáticos, PDFs, ZIPs, GPKG) com retry
// ---------------------------------------------------------------------------

export interface DownloadFromUrlOptions {
    retries?: number;
    retryDelayMs?: number;
    skipIfExists?: boolean;
    timeoutMs?: number;
}

export async function safeDownloadFromUrl(
    url: string,
    destPath: string,
    opts: DownloadFromUrlOptions = {}
): Promise<string> {
    const log = logger.forMethod('safeDownloadFromUrl');
    const fileName = path.basename(destPath);
    const destDir = path.dirname(destPath);

    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
    }

    if (opts.skipIfExists && isValidDownloadedFile(destPath)) {
        log.info(`[${fileName}] Arquivo já existente e válido. Download pulado.`);
        return destPath;
    }

    const retries = opts.retries ?? 2;
    const retryDelay = opts.retryDelayMs ?? 3000;
    const timeoutMs = opts.timeoutMs ?? 60000;
    let lastError: unknown;

    for (let attempt = 1; attempt <= retries + 1; attempt++) {
        try {
            log.info(`[${fileName}] Baixando via URL (tentativa ${attempt}/${retries + 1}): ${url}`);
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);

            const res = await fetch(url, { signal: controller.signal });
            clearTimeout(timer);

            if (!res.ok) {
                throw new Error(`HTTP ${res.status}: ${res.statusText}`);
            }

            const arrayBuf = await res.arrayBuffer();
            const buffer = Buffer.from(arrayBuf);

            if (buffer.length === 0) {
                throw new Error('Conteúdo baixado tem tamanho 0 bytes.');
            }

            // Gravação atômica via arquivo temporário
            const tmpPath = `${destPath}.tmp-${Date.now()}`;
            fs.writeFileSync(tmpPath, buffer);

            if (!isValidDownloadedFile(tmpPath)) {
                try { fs.unlinkSync(tmpPath); } catch { }
                throw new Error('Arquivo baixado não passou no teste de validação de integridade.');
            }

            fs.renameSync(tmpPath, destPath);
            log.info(`[${fileName}] Arquivo salvo com sucesso (${buffer.length} bytes): ${destPath}`);
            return destPath;
        } catch (error) {
            lastError = error;
            log.warn(`[${fileName}] Falha ao baixar da URL: ${errMsg(error)}`);
            if (attempt <= retries) {
                await sleep(retryDelay * attempt);
            }
        }
    }

    throw new Error(`Falha definitiva ao baixar ${url} após ${retries + 1} tentativas: ${formatError(lastError)}`);
}

// ---------------------------------------------------------------------------
// Interceptação segura de JSON ("Ver em tela") com retries
// ---------------------------------------------------------------------------

export interface DownloadJsonResponseOptions {
    timeout?: number;
    retries?: number;
    retryDelayMs?: number;
    skipIfExists?: boolean;
}

export async function safeDownloadJsonFromResponse(
    page: Page,
    downloadPath: string,
    filePrefix: string,
    triggerAction: () => Promise<void>,
    urlMatch: string | RegExp,
    opts: DownloadJsonResponseOptions = {}
): Promise<string> {
    const log = logger.forMethod('safeDownloadJsonFromResponse');
    const finalPath = path.join(downloadPath, `${filePrefix}.json`);

    if (opts.skipIfExists && isValidDownloadedFile(finalPath)) {
        log.info(`[${filePrefix}] JSON já existente e válido. Download pulado.`);
        return finalPath;
    }

    const retries = opts.retries ?? 2;
    const retryDelay = opts.retryDelayMs ?? 3000;
    const timeout = opts.timeout ?? 60000;
    let lastError: unknown;

    for (let attempt = 1; attempt <= retries + 1; attempt++) {
        try {
            log.info(`[${filePrefix}] Interceptando requisição JSON (tentativa ${attempt}/${retries + 1})...`);

            const matchFn = (res: HTTPResponse) => {
                const matchesUrl = typeof urlMatch === 'string'
                    ? res.url().includes(urlMatch)
                    : urlMatch.test(res.url());
                return matchesUrl && res.request().method() === 'GET';
            };

            const responsePromise = page.waitForResponse(matchFn, { timeout });
            await triggerAction();

            const response = await responsePromise;
            if (!response.ok()) {
                throw new Error(`Resposta HTTP retornou status ${response.status()}`);
            }

            const json = await response.json();
            const tmpPath = `${finalPath}.tmp-${Date.now()}`;
            fs.writeFileSync(tmpPath, JSON.stringify(json, null, 2));

            if (!isValidDownloadedFile(tmpPath)) {
                try { fs.unlinkSync(tmpPath); } catch { }
                throw new Error('JSON recebido vazio ou inválido.');
            }

            fs.renameSync(tmpPath, finalPath);
            log.info(`[${filePrefix}] Dados salvos em JSON com sucesso em: ${finalPath}`);
            return finalPath;
        } catch (error) {
            lastError = error;
            log.warn(`[${filePrefix}] Falha ao interceptar JSON: ${errMsg(error)}`);
            if (attempt <= retries) {
                await sleep(retryDelay * attempt);
            }
        }
    }

    throw new Error(`Falha definitiva ao interceptar JSON [${filePrefix}]: ${formatError(lastError)}`);
}

// ---------------------------------------------------------------------------
// Execução resiliente de combinações de dropdown
// ---------------------------------------------------------------------------

export interface CombinationRetryOptions {
    maxRetries?: number;
    delayMs?: number;
}

/**
 * Executa uma combinação de dropdown/filtro de forma isolada e segura.
 * Se a combinação falhar após os retries, ela é registrada no log de auditoria
 * mas NÃO derruba o processo, permitindo que as próximas combinações prossigam.
 *
 * Retorna true se a combinação foi concluída com sucesso, ou false se falhou.
 */
export async function safeRunCombination(
    combinationName: string,
    action: () => Promise<void>,
    opts: CombinationRetryOptions = {}
): Promise<boolean> {
    const log = logger.forMethod('safeRunCombination');
    const maxRetries = opts.maxRetries ?? 2;
    const delayMs = opts.delayMs ?? 2000;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
        try {
            await action();
            return true;
        } catch (error) {
            lastError = error;
            const errString = errMsg(error);

            // Se for ausência de dados confirmada pelo servidor governamental
            if (errString.includes('[NO_DATA]')) {
                log.info(`[${combinationName}] Combinação sem dados disponíveis no portal. Prosseguindo.`);
                return true;
            }

            log.warn(`[${combinationName}] Erro na tentativa ${attempt}/${maxRetries + 1}: ${errString}`);

            if (attempt <= maxRetries) {
                const wait = delayMs * attempt;
                log.info(`[${combinationName}] Aguardando ${wait}ms para retry da combinação...`);
                await sleep(wait);
            }
        }
    }

    log.error(
        { data: formatError(lastError) },
        `[${combinationName}] Falha na combinação após ${maxRetries + 1} tentativas. Prosseguindo para as próximas para evitar perda de dados.`
    );
    return false;
}