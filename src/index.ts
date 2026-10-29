// src/index.ts
/**
 * Ponto de entrada da aplicação (orquestrador geral do ETL).
 *
 * Fluxo completo (padrão):
 *
 *   1. bronze:scrape     -> Puppeteer baixa os arquivos do portal para ./downloads
 *   2. bronze:transform  -> Lê ./downloads e carrega os dados BRUTOS (texto) no raw_db
 *   3. silver            -> Normaliza (1FN/2FN/3FN) raw_db -> db (dimensões + fatos)
 *
 * Uso:
 *   npm run app                                   # executa tudo
 *   npm run app -- --stage silver                 # apenas a etapa silver
 *   npm run app -- --stage bronze:transform,silver
 *   npm run app -- --skip bronze:scrape           # tudo, exceto o scraping
 *   npm run app -- --help
 *
 * Códigos de saída:
 *   0 = todas as etapas selecionadas concluíram
 *   1 = alguma etapa falhou (as etapas seguintes NÃO são executadas)
 *   2 = argumentos inválidos
 *   130 = interrompido pelo usuário (SIGINT) / 143 = SIGTERM
 */
import { parseArgs } from "node:util";
import { new_logger } from "./services/logs.js";
import { formatError } from "./pipeline_bronze/downloader.js";
import { runScrapper } from "./pipeline_bronze/scraper.js";
import { runTransformers } from "./pipeline_bronze/transformer.js";
import { runSilverPipeline } from "./pipeline_silver/transformer.js";

const logger = new_logger(import.meta.url);

// ---------------------------------------------------------------------------
// Definição das etapas (a ordem do array É a ordem de execução)
// ---------------------------------------------------------------------------

type StageName = "bronze:scrape" | "bronze:transform" | "silver";

interface Stage {
    name: StageName;
    description: string;
    run: () => Promise<void>;
}

const STAGES: readonly Stage[] = [
    {
        name: "bronze:scrape",
        description: "Scraping do portal e download dos arquivos (./downloads)",
        run: runScrapper,
    },
    {
        name: "bronze:transform",
        description: "Carga dos arquivos baixados no banco raw (bronze)",
        run: runTransformers,
    },
    {
        name: "silver",
        description: "Normalização raw_db -> db (silver, 3FN)",
        run: runSilverPipeline,
    },
];

const STAGE_NAMES = STAGES.map((s) => s.name);

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

class CliError extends Error { }

function printHelp(): void {
    const lines = [
        "Uso: npm run app -- [opções]",
        "",
        "Opções:",
        "  -s, --stage <lista>   Etapas a executar, separadas por vírgula (padrão: todas)",
        "      --skip <lista>    Etapas a ignorar, separadas por vírgula",
        "  -l, --list            Lista as etapas disponíveis e sai",
        "  -h, --help            Exibe esta ajuda",
        "",
        "Etapas disponíveis (em ordem de execução):",
        ...STAGES.map((s) => `  ${s.name.padEnd(18)} ${s.description}`),
    ];
    console.log(lines.join("\n"));
}

function parseStageList(raw: string | undefined, flag: string): StageName[] {
    if (!raw) return [];
    const names = raw.split(",").map((s) => s.trim()).filter(Boolean);
    const invalid = names.filter((n) => !STAGE_NAMES.includes(n as StageName));
    if (invalid.length > 0) {
        throw new CliError(
            `Etapa(s) inválida(s) em --${flag}: ${invalid.join(", ")}. Válidas: ${STAGE_NAMES.join(", ")}`
        );
    }
    return names as StageName[];
}

/** Resolve quais etapas rodar, sempre respeitando a ordem canônica de STAGES. */
function resolveStages(argv: string[]): Stage[] | null {
    const { values } = parseArgs({
        args: argv,
        options: {
            stage: { type: "string", short: "s" },
            skip: { type: "string" },
            list: { type: "boolean", short: "l", default: false },
            help: { type: "boolean", short: "h", default: false },
        },
        strict: true,
    });

    if (values.help || values.list) {
        printHelp();
        return null;
    }

    const only = parseStageList(values.stage, "stage");
    const skip = new Set(parseStageList(values.skip, "skip"));

    const selected = STAGES.filter(
        (s) => (only.length === 0 || only.includes(s.name)) && !skip.has(s.name)
    );

    if (selected.length === 0) {
        throw new CliError("Nenhuma etapa selecionada para execução.");
    }
    return selected;
}

// ---------------------------------------------------------------------------
// Execução
// ---------------------------------------------------------------------------

interface StageResult {
    name: StageName;
    status: "ok" | "failed";
    durationMs: number;
}

function formatDuration(ms: number): string {
    const totalSec = Math.round(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return [h ? `${h}h` : "", h || m ? `${m}m` : "", `${s}s`].filter(Boolean).join(" ");
}

/**
 * Executa as etapas em sequência. Se uma falhar, interrompe: a etapa seguinte
 * depende dos dados produzidos pela anterior.
 */
async function runStages(stages: Stage[]): Promise<StageResult[]> {
    const log = logger.forMethod("runStages");
    const results: StageResult[] = [];

    log.info(`Etapas selecionadas: ${stages.map((s) => s.name).join(" -> ")}`);

    for (const [index, stage] of stages.entries()) {
        const tag = `[${index + 1}/${stages.length}] ${stage.name}`;
        const startedAt = Date.now();
        log.info(`${tag} - iniciando: ${stage.description}`);

        try {
            await stage.run();
            const durationMs = Date.now() - startedAt;
            results.push({ name: stage.name, status: "ok", durationMs });
            log.info(`${tag} - concluída em ${formatDuration(durationMs)}`);
        } catch (error) {
            const durationMs = Date.now() - startedAt;
            results.push({ name: stage.name, status: "failed", durationMs });
            log.error({ data: formatError(error) }, `${tag} - FALHOU após ${formatDuration(durationMs)}. Abortando.`);
            break;
        }
    }
    return results;
}

function summarize(results: StageResult[], totalMs: number): void {
    const log = logger.forMethod("summarize");
    log.info("================ RESUMO DA EXECUÇÃO ================");
    for (const r of results) {
        log.info(`${r.status === "ok" ? "OK    " : "FALHOU"} ${r.name.padEnd(18)} ${formatDuration(r.durationMs)}`);
    }
    log.info(`Tempo total: ${formatDuration(totalMs)}`);
}

/**
 * Pools de conexão (mysql2) e o transport do pino mantêm o event loop vivo, e o
 * logger grava logs >= warn no banco de forma assíncrona. Damos uma pequena
 * margem para esses writes terminarem antes de encerrar o processo.
 */
async function exitGracefully(code: number): Promise<never> {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    process.exit(code);
}

function registerSignalHandlers(): void {
    for (const [signal, code] of [["SIGINT", 130], ["SIGTERM", 143]] as const) {
        process.once(signal, () => {
            logger.forMethod("signal").warn(`Sinal ${signal} recebido. Encerrando...`);
            void exitGracefully(code);
        });
    }
}

async function main(): Promise<void> {
    const log = logger.forMethod("main");
    registerSignalHandlers();

    let stages: Stage[] | null;
    try {
        stages = resolveStages(process.argv.slice(2));
    } catch (error) {
        console.error(`Erro: ${error instanceof Error ? error.message : String(error)}\n`);
        printHelp();
        return exitGracefully(2);
    }
    if (!stages) return exitGracefully(0); // --help / --list

    const startedAt = Date.now();
    log.info("Iniciando pipeline ETL (Bronze -> Silver)");

    const results = await runStages(stages);
    summarize(results, Date.now() - startedAt);

    const failed = results.some((r) => r.status === "failed");
    return exitGracefully(failed ? 1 : 0);
}

process.on("unhandledRejection", (reason) => {
    logger.forMethod("unhandledRejection").error({ data: formatError(reason) }, "Promise rejeitada sem tratamento");
});

await main();