import { Page } from 'puppeteer';

export async function getRelatorioDeCampos(page: Page) {
    const relatorio = await page.$$eval(
        '#main-content input, #main-content button, #main-content select, #main-content textarea, #main-content a, #main-content p-dropdown, #main-content p-table, #main-content p-radiobutton',
        (elements) => {
            // Estrutura do nosso relatório categorizado
            const resultados = {
                inputsTexto: [] as any[],
                dropdowns: [] as any[],
                radios: [] as any[],
                botoes: [] as any[],
                links: [] as any[],
                tabelas: [] as any[],
                outros: [] as any[]
            };

            elements.forEach((el, index) => {
                const tag = el.tagName.toLowerCase();
                const type = el.getAttribute('type');
                
                // 1. Busca contexto (Pai/Avô) para entender a Label de elementos sem ID claro
                const container = el.parentElement;
                const contextoText = container?.parentElement?.innerText?.replace(/\s+/g, ' ').trim().slice(0, 250);

                // 2. Resolve IDs e Names de componentes aninhados (PrimeNG)
                const innerInput = el.querySelector('input, span[id], div[id], [role="combobox"]');
                const resolvedId = el.id || (innerInput ? innerInput.id : null);
                const resolvedName = el.getAttribute('name') || (innerInput ? innerInput.getAttribute('name') : null);
                
                // 3. Verifica estado desabilitado (Nativo e PrimeNG)
                const disabled = (el as HTMLInputElement).disabled || 
                                 el.classList.contains('p-disabled') || 
                                 el.getAttribute('aria-disabled') === 'true' ||
                                 innerInput?.getAttribute('aria-disabled') === 'true';

                // Base comum para todos os elementos
                const baseData = {
                    indiceDOM: index,
                    tag,
                    id: resolvedId,
                    name: resolvedName,
                    disabled,
                    testId: el.getAttribute('data-testid') || el.getAttribute('data-cy') || null,
                    contexto: contextoText,
                    classes: el.className
                };

                // 4. Categorização e Extração Específica
                if (tag === 'p-dropdown' || tag === 'select') {
                    const combobox = el.querySelector('[role="combobox"]');
                    const selectedText = combobox ? combobox.textContent?.trim() : (tag === 'select' ? (el as HTMLSelectElement).options[(el as HTMLSelectElement).selectedIndex]?.text : el.textContent?.trim());
                    
                    resultados.dropdowns.push({
                        ...baseData,
                        textoSelecionado: selectedText
                    });

                } else if (tag === 'p-radiobutton' || (tag === 'input' && type === 'radio')) {
                    const isChecked = (el as HTMLInputElement).checked || 
                                      el.classList.contains('p-radiobutton-checked') || 
                                      el.querySelector('.p-radiobutton-checked') !== null ||
                                      el.getAttribute('aria-checked') === 'true';

                    resultados.radios.push({
                        ...baseData,
                        value: (el as HTMLInputElement).value || (innerInput as HTMLInputElement)?.value || null,
                        checked: isChecked,
                        // Refina o contexto pegando o irmão direto caso seja radio
                        labelProxima: container?.innerText?.replace(/\s+/g, ' ').trim()
                    });

                } else if (tag === 'button') {
                    resultados.botoes.push({
                        ...baseData,
                        texto: el.textContent?.replace(/\s+/g, ' ').trim().slice(0, 100),
                        ariaLabel: el.getAttribute('aria-label')
                    });

                } else if (tag === 'a') {
                    resultados.links.push({
                        ...baseData,
                        texto: el.textContent?.replace(/\s+/g, ' ').trim().slice(0, 100),
                        href: el.getAttribute('href')
                    });

                } else if (tag === 'input' || tag === 'textarea') {
                    if (type === 'checkbox') {
                        resultados.outros.push({
                            ...baseData,
                            tipo: 'checkbox',
                            checked: (el as HTMLInputElement).checked
                        });
                    } else {
                        resultados.inputsTexto.push({
                            ...baseData,
                            tipo: type || 'text',
                            value: (el as HTMLInputElement).value,
                            placeholder: el.getAttribute('placeholder')
                        });
                    }

                } else if (tag === 'p-table') {
                    resultados.tabelas.push({
                        ...baseData,
                        quantidadeLinhas: el.querySelectorAll('tbody tr').length
                    });
                } else {
                    resultados.outros.push(baseData);
                }
            });

            return resultados;
        }
    );

    // Imprime o relatório bonitão no console do Node, exibindo todos os níveis
    console.log('=== RELATÓRIO DE CAMPOS DA PÁGININA ===');
    console.dir(relatorio, { depth: null, colors: true });
    
    return relatorio;
}

export async function getElementosHelper(page: Page) {
    const elementos = await page.$$eval(
        // 1. Adicionado p-radiobutton na lista de seletores
        '#main-content input, #main-content button, #main-content select, #main-content textarea, #main-content a, #main-content p-dropdown, #main-content p-table, #main-content p-radiobutton',
        (elements) =>
            elements.map((el) => {
                const innerInput = el.querySelector('input, span[id], div[id]');
                const resolvedId = el.id || (innerInput ? innerInput.id : null);

                // 2. Resolve o "name" buscando também no input interno (muito comum em PrimeNG)
                const resolvedName = el.getAttribute('name') || (innerInput ? innerInput.getAttribute('name') : null);

                // 3. Verifica se o radio/checkbox está selecionado (suporta nativo e PrimeNG)
                const isChecked = (el as HTMLInputElement).checked ||
                    el.classList.contains('p-radiobutton-checked') ||
                    el.querySelector('.p-radiobutton-checked') !== null ||
                    el.getAttribute('aria-checked') === 'true' ||
                    el.querySelector('[aria-checked="true"]') !== null;

                const resolvedValue = (el as HTMLInputElement).value || (innerInput as HTMLInputElement)?.value || undefined;

                return {
                    tag: el.tagName.toLowerCase(),
                    type: el.getAttribute('type') || (el.tagName.toLowerCase() === 'p-radiobutton' ? 'radio' : null),
                    id: resolvedId,
                    name: resolvedName,
                    checked: isChecked, // <-- Essencial para scrapers de formulário
                    value: resolvedValue,
                    ariaLabel: el.getAttribute('aria-label'),
                    placeholder: el.getAttribute('placeholder'),
                    testId: el.getAttribute('data-testid') || el.getAttribute('data-cy') || null,
                    classes: el.className,
                    disabled: (el as HTMLInputElement).disabled || el.classList.contains('p-disabled') || el.getAttribute('aria-disabled') === 'true',
                    href: el.getAttribute('href'),
                    texto: el.textContent?.replace(/\s+/g, ' ').trim().slice(0, 100),
                };
            })
    );

    console.log(elementos);
}

// Helper específico para mapear os Radios e seus contextos
export async function getRadiosData(page: Page) {
    const radios = await page.$$eval('p-radiobutton, input[type="radio"]', (elements) =>
        elements.map((el, index) => {
            const container = el.parentElement;
            const innerInput = el.querySelector('input');

            const resolvedId = el.id || (innerInput ? innerInput.id : null);
            const resolvedName = el.getAttribute('name') || (innerInput ? innerInput.getAttribute('name') : null);
            const resolvedValue = (el as HTMLInputElement).value || (innerInput as HTMLInputElement)?.value || null;

            const isChecked = (el as HTMLInputElement).checked ||
                el.classList.contains('p-radiobutton-checked') ||
                el.querySelector('.p-radiobutton-checked') !== null ||
                el.getAttribute('aria-checked') === 'true';

            return {
                indice: index,
                name: resolvedName, // O 'name' é o que agrupa os radios da mesma pergunta
                id: resolvedId,
                value: resolvedValue,
                checked: isChecked,
                disabled: (el as HTMLInputElement).disabled || el.classList.contains('p-disabled'),
                // O label de um radio geralmente é um irmão no DOM, pegamos o texto do container para tentar achar a resposta
                contexto: container?.innerText?.replace(/\s+/g, ' ').trim().slice(0, 200),
            };
        })
    );

    console.dir(radios, { depth: null });
}

export async function getDropdownsData(page: Page) {
    const dropdowns = await page.$$eval('p-dropdown', (elements) =>
        elements.map((el, index) => {
            const container = el.parentElement;

            // Busca o span interno que atua como o combobox real no PrimeNG
            const combobox = el.querySelector('[role="combobox"]');
            const resolvedId = el.id || (combobox ? combobox.id : null);
            const selectedText = combobox ? combobox.textContent?.trim() : el.textContent?.trim();

            return {
                indice: index,
                name: el.getAttribute('name'),
                id: resolvedId,
                textoSelecionado: selectedText,
                disabled: el.classList.contains('p-disabled') || combobox?.getAttribute('aria-disabled') === 'true',
                contexto: container?.parentElement?.innerText?.replace(/\s+/g, ' ').trim().slice(0, 250),
                // htmlInterno: el.innerHTML.slice(0, 1000) // Opcional manter, mas agora os dados vitais já estão extraídos acima
            };
        })
    );

    console.dir(dropdowns, { depth: null });
}