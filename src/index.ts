import { runScrapper } from "./pipeline_bronze/scraper.js";
import { runTransformers } from "./pipeline_bronze/transformer.js";
import { runSilverPipeline } from "./pipeline_silver/transformer.js";

async function main() {
    //await runScrapper();
    //await runTransformers();
    await runSilverPipeline();

    return;
}

await main();