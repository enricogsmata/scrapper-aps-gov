import puppeteer, { Browser, Page } from 'puppeteer';

export async function getControlesScraper(url: string) {
    const browser: Browser = await puppeteer.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--window-size=1366,768'
        ]
    });

    try {
        const page: Page = await browser.newPage();
        await page.setViewport({ width: 1366, height: 768 });

        // 1. Navega até a página
        await page.goto(url, { 
            waitUntil: 'networkidle2', 
            timeout: 60000 
        });

        // 2. Trava a execução até que o campo principal de UF realmente exista no DOM
        // O JSF usa dois pontos no ID (ex: j_idt58:uf), então buscamos com seletor flexível de sufixo [id$=":uf"]
        await page.waitForSelector('select[id$=":uf"], select[name$=":uf"]', { 
            timeout: 25000 
        });

        // 3. Extrai apenas os elementos úteis do formulário ativo
        const mapa = await page.evaluate(() => {
            // Localiza o formulário que contém o select de UF
            const ufSelect = document.querySelector('select[id$=":uf"], select[name$=":uf"]');
            const form = ufSelect ? ufSelect.closest('form') || document.body : document.body;

            // Mapeia os Dropdowns e suas opções disponíveis
            const dropdowns = Array.from(form.querySelectorAll('select')).map(sel => ({
                id: sel.id,
                name: sel.name,
                isSelect2: sel.classList.contains('select2-hidden-accessible'),
                opcoes: Array.from(sel.options)
                    .map(opt => ({ 
                        valor: opt.value, 
                        rotulo: opt.text.trim() 
                    }))
                    .filter(opt => opt.valor && opt.valor !== '' && !opt.rotulo.toLowerCase().includes('selecione'))
            }));

            // Mapeia Radios (nativos ou emulados)
            const radios = Array.from(form.querySelectorAll('input[type="radio"], .ui-radiobutton')).map(r => {
                const input = (r.tagName.toLowerCase() === 'input' ? r : r.querySelector('input')) as HTMLInputElement | null;
                const container = r.closest('label') || r.parentElement;
                return {
                    id: input?.id || r.id,
                    name: input?.name || null,
                    value: input?.value || null,
                    checked: input ? input.checked : false,
                    label: container?.innerText?.replace(/\s+/g, ' ').trim().slice(0, 80) || ''
                };
            });

            // Mapeia botões de ação / download
            const botoesDownload = Array.from(
                form.querySelectorAll('input[type="submit"], input[type="button"], button, a')
            ).filter(el => {
                const id = el.id.toLowerCase();
                const text = (el.textContent || '').toLowerCase();
                const val = ((el as HTMLInputElement).value || '').toLowerCase();
                return id.includes('download') || text.includes('download') || val.includes('download');
            }).map(el => ({
                id: el.id || null,
                tag: el.tagName.toLowerCase(),
                tipo: el.getAttribute('type') || null,
                classes: el.getAttribute('class') || '',
                oculto: el.classList.contains('hidden') || (el as HTMLElement).offsetParent === null,
                texto: (el.textContent || (el as HTMLInputElement).value || '').replace(/\s+/g, ' ').trim()
            }));

            return { dropdowns, radios, botoesDownload };
        });

        console.log('=== DADOS MAPEADOS PARA O SCRAPER ===');
        console.dir(mapa, { depth: null });
        return mapa;

    } catch (error) {
        console.error('Falha ao extrair controles:', error);
        throw error;
    } finally {
        await browser.close();
    }
}