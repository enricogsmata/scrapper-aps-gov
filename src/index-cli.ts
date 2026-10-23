import puppeteer, { Browser } from "puppeteer";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { new_logger } from "./services/logs.js";
import { mainPageScrapper, runModules, ScrapedModules, ScrapeOptions } from "./scraper.js";

/**
 * CLI interativa para testes do scrapper.
 *
 * Toda a lógica de scraping vive em scraper.ts; aqui só coletamos as escolhas do
 * usuário e as repassamos como ScrapeOptions.
 *
 * Fluxo 1 (padrão): main page + todos os módulos.
 * Fluxo 2 (interativo): main page; depois o usuário escolhe
 *   - rodar apenas um módulo (pelo índice) ou todos a partir de um índice;
 *   - o link inicial dentro do módulo escolhido;
 *   - baixar apenas 1 arquivo por página ou todos os arquivos.
 */

const logger = new_logger(import.meta.url);
const HEADLESS = process.env.HEADLESS !== 'false';

async function askChoice(rl: readline.Interface, question: string, valid: string[]): Promise<string> {
    while (true) {
        const answer = (await rl.question(question)).trim();
        if (valid.includes(answer)) return answer;
        console.log(`  Opção inválida. Escolha entre: ${valid.join(', ')}`);
    }
}

async function askIndex(rl: readline.Interface, question: string, total: number): Promise<number> {
    while (true) {
        const answer = (await rl.question(question)).trim();
        const n = Number(answer);
        if (Number.isInteger(n) && n >= 1 && n <= total) return n - 1;
        console.log(`  Índice inválido. Informe um número entre 1 e ${total}.`);
    }
}

function printModules(modules: ScrapedModules[]): void {
    console.log('\nMódulos encontrados na main page:');
    modules.forEach((mod, i) => {
        console.log(`  [${i + 1}] ${mod.module} (${mod.links.length} link(s))`);
        mod.links.forEach((link, l) => {
            console.log(`        ${i + 1}.${l + 1}  ${link}`);
        });
    });
    console.log('');
}

async function promptOptions(rl: readline.Interface, modules: ScrapedModules[]): Promise<ScrapeOptions | null> {
    const log = logger.forMethod('promptOptions');

    printModules(modules);

    console.log('Escopo da execução:');
    console.log('  [1] Apenas um módulo específico (para ao terminar)');
    console.log('  [2] Todos os módulos a partir de um índice\n');
    const scope = await askChoice(rl, 'Escolha o escopo (1/2): ', ['1', '2']);

    const startModule = await askIndex(
        rl,
        scope === '1'
            ? `Índice do módulo (1-${modules.length}): `
            : `Índice do módulo inicial (1-${modules.length}): `,
        modules.length
    );
    const endModule = scope === '1' ? startModule : modules.length - 1;

    const selectedModule = modules[startModule];
    if (selectedModule.links.length === 0) {
        log.warn(`O módulo "${selectedModule.module}" não possui links. Encerrando.`);
        return null;
    }

    console.log(`\nLinks do módulo "${selectedModule.module}":`);
    selectedModule.links.forEach((link, l) => {
        console.log(`  [${l + 1}] ${link}`);
    });
    console.log('');
    const startLink = await askIndex(
        rl,
        `Índice do link inicial (1-${selectedModule.links.length}): `,
        selectedModule.links.length
    );

    console.log('\nTipo de download:');
    console.log('  [1] Apenas 1 arquivo por página (primeira combinação de filtros; não baixa se já existir)');
    console.log('  [2] Todos os arquivos do módulo\n');
    const dl = await askChoice(rl, 'Escolha o tipo de download (1/2): ', ['1', '2']);

    const options: ScrapeOptions = { startModule, endModule, startLink, singleFile: dl === '1' };

    console.log(
        `\nExecutando: módulo ${startModule + 1}, a partir do link ${startLink + 1}` +
        (endModule !== startModule ? ` (e módulos seguintes até o ${endModule + 1})` : '') +
        ` | download: ${options.singleFile ? '1 arquivo por página' : 'todos os arquivos'}\n`
    );

    return options;
}

async function main(): Promise<void> {
    const log = logger.forMethod('main');
    const rl = readline.createInterface({ input, output });
    let browser: Browser | null = null;

    try {
        console.log('\n=== Scrapper - CLI de testes ===');
        console.log('  [1] Fluxo padrão: main page + todos os módulos');
        console.log('  [2] Fluxo interativo: main page + escolha de módulo(s) e tipo de download\n');

        const flow = await askChoice(rl, 'Escolha o fluxo (1/2): ', ['1', '2']);

        browser = await puppeteer.launch({ headless: HEADLESS });
        const page = await browser.newPage();

        const modules = await mainPageScrapper(page);

        if (modules.length === 0) {
            log.warn('Nenhum módulo encontrado na main page. Encerrando.');
            return;
        }

        const options: ScrapeOptions | null = flow === '1' ? {} : await promptOptions(rl, modules);
        if (!options) return;

        await runModules(page, modules, options);
        log.info('Execução finalizada com sucesso!');
    } catch (error) {
        log.error({ err: error }, 'Falha crítica na execução da CLI.');
        process.exitCode = 1;
    } finally {
        rl.close();
        if (browser) await browser.close();
    }
}

await main();