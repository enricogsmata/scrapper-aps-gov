// src/transformer.ts
import { transformGerenciaapsAusenciaEnvioProducao } from "./transformers/credenciamento-e-financiamento/gerenciaapsAusenciaEnvioProducaoTransformer.js";
import { transformGerenciaapsInesCnesHomologados } from "./transformers/credenciamento-e-financiamento/gerenciaapsInesCnesHomologadosTransformer.js";
import { transformGerenciaapsPagamentoHistorico } from "./transformers/credenciamento-e-financiamento/gerenciaapsPagamentoHistoricoTransformer.js";
import { transformGerenciaapsPagamento } from "./transformers/credenciamento-e-financiamento/gerenciaapsPagamentoTransformer.js";

//await transformGerenciaapsAusenciaEnvioProducao();
//await transformGerenciaapsPagamento();
//await transformGerenciaapsPagamentoHistorico();
await transformGerenciaapsInesCnesHomologados();