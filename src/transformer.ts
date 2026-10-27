// src/transformer.ts
import { transformGerenciaapsAusenciaEnvioProducao } from "./transformers/credenciamento-e-financiamento/gerenciaapsAusenciaEnvioProducaoTransformer.js";
import { transformGerenciaapsPagamento } from "./transformers/credenciamento-e-financiamento/gerenciaapsPagamentoTransformer.js";

//await transformGerenciaapsAusenciaEnvioProducao();
await transformGerenciaapsPagamento();