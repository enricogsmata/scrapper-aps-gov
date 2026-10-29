import { runScrapper } from "./pipeline_bronze/scraper.js";
import { runTransformers } from "./pipeline_bronze/transformer.js";

async function main() {
    await runScrapper();
    await runTransformers();
    return;
}

await main();