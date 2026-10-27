// src/transformer.ts
import { transformGerenciaapsAusenciaEnvioProducao } from "./transformers/credenciamento-e-financiamento/gerenciaapsAusenciaEnvioProducaoTransformer.js";
import { transformGerenciaapsInesCnesHomologados } from "./transformers/credenciamento-e-financiamento/gerenciaapsInesCnesHomologadosTransformer.js";
import { transformGerenciaapsOutrosIncentivos } from "./transformers/credenciamento-e-financiamento/gerenciaapsOutrosIncentivosTransformer.js";
import { transformGerenciaapsPagamentoHistorico } from "./transformers/credenciamento-e-financiamento/gerenciaapsPagamentoHistoricoTransformer.js";
import { transformGerenciaapsPagamento } from "./transformers/credenciamento-e-financiamento/gerenciaapsPagamentoTransformer.js";
import { transformGerenciaapsSolicitacoesAdesao } from "./transformers/credenciamento-e-financiamento/gerenciaapsSolicitacoesAdesaoTransformer.js";
import { transformGestaofederalPublicoRelatorioSolicitacoes } from "./transformers/credenciamento-e-financiamento/gestaofederalPublicoRelatorioSolicitacoesTransformer.js";

//await transformGerenciaapsAusenciaEnvioProducao();
//await transformGerenciaapsPagamento();
//await transformGerenciaapsPagamentoHistorico();
//await transformGerenciaapsInesCnesHomologados();
//await transformGestaofederalPublicoRelatorioSolicitacoes();
//await transformGerenciaapsSolicitacoesAdesao();
await transformGerenciaapsOutrosIncentivos();