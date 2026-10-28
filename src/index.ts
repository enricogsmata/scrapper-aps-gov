import { runScrapper } from "./scraper.js";
import { runTransformers } from "./transformer.js";

async function main() {
    await runScrapper();
    await runTransformers();
    return;
}

await main();