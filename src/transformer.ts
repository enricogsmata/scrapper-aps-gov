// src/transformer.ts
import { new_logger } from "./services/logs.js";
import { formatError } from "./downloader.js";
import { transformAcoesEProgramasAdesaoPse } from "./transformers/acoes-e-programas/acoesEProgramasAdesaoPseTransformer.js";
import { transformAcoesEProgramasDescontinuadosAdesaoSaudeHora } from "./transformers/acoes-e-programas/acoesEProgramasDescontinuadosAdesaoSaudeHoraTransformer.js";
import { transformAcoesEProgramasDescontinuadosInformatizaAps } from "./transformers/acoes-e-programas/acoesEProgramasDescontinuadosInformatizaApsTransformer.js";
import { transformAcoesEProgramasHomologacaoSaudeComAgente } from "./transformers/acoes-e-programas/acoesEProgramasHomologacaoSaudeComAgenteTransformer.js";
import { transformAcoesEProgramasIndicadorCadastro } from "./transformers/acoes-e-programas/acoesEProgramasIndicadorCadastroTransformer.js";
import { transformAcoesEProgramasIndicadorPainel } from "./transformers/acoes-e-programas/acoesEProgramasIndicadorPainelTransformer.js";
import { transformAcoesEProgramasIndicadorPrenatal } from "./transformers/acoes-e-programas/acoesEProgramasIndicadorPrenatalTransformer.js";
import { transformAcoesEProgramasRelpagamentopmaq } from "./transformers/acoes-e-programas/acoesEProgramasRelpagamentopmaqTransformer.js";
import { transformAcoesEProgramasSaudeAtividadeColetiva } from "./transformers/acoes-e-programas/acoesEProgramasSaudeAtividadeColetivaTransformer.js";
import { transformAcoesEProgramasSaudeProducao } from "./transformers/acoes-e-programas/acoesEProgramasSaudeProducaoTransformer.js";
import { transformSisabValidacao } from "./transformers/acoes-e-programas/sisabValidacaoTransformer.js";
import { transformCoberturaAcs } from "./transformers/cobertura-da-aps/coberturaAcsTransformer.js";
import { transformCoberturaApsHistorico } from "./transformers/cobertura-da-aps/coberturaApsHistoricoTransformer.js";
import { transformCoberturaAps } from "./transformers/cobertura-da-aps/coberturaApsTransformer.js";
import { transformCoberturaSaudeBucalV2 } from "./transformers/cobertura-da-aps/coberturaSaudeBucalV2Transformer.js";
import { transformMapasSus } from "./transformers/cobertura-da-aps/mapasSusTransformer.js";
import { transformCoberturaSaudeBucalV2Historico } from "./transformers/cobertura-da-aps/oberturaSaudeBucalV2HistoricoTransformer.js";
import { transformRelHistoricoPagamentoEsf } from "./transformers/cobertura-da-aps/relHistoricoPagamentoEsfTransformer.js";
import { transformRelHistoricoPagamentoOutros } from "./transformers/cobertura-da-aps/relHistoricoPagamentoOutrosTransformer.js";
import { transformGerenciaapsAusenciaEnvioProducao } from "./transformers/credenciamento-e-financiamento/gerenciaapsAusenciaEnvioProducaoTransformer.js";
import { transformGerenciaapsInesCnesHomologados } from "./transformers/credenciamento-e-financiamento/gerenciaapsInesCnesHomologadosTransformer.js";
import { transformGerenciaapsOutrosIncentivos } from "./transformers/credenciamento-e-financiamento/gerenciaapsOutrosIncentivosTransformer.js";
import { transformGerenciaapsPagamentoHistorico } from "./transformers/credenciamento-e-financiamento/gerenciaapsPagamentoHistoricoTransformer.js";
import { transformGerenciaapsPagamento } from "./transformers/credenciamento-e-financiamento/gerenciaapsPagamentoTransformer.js";
import { transformGerenciaapsSolicitacoesAdesao } from "./transformers/credenciamento-e-financiamento/gerenciaapsSolicitacoesAdesaoTransformer.js";
import { transformGestaofederalPublicoRelatorioSolicitacoes } from "./transformers/credenciamento-e-financiamento/gestaofederalPublicoRelatorioSolicitacoesTransformer.js";
import { transformSiapsPublicoPraticasAssistenciaisAtendimentosIndividuais } from "./transformers/siaps/siapsPublicoPraticasAssistenciaisAtendimentosIndividuaisTransformer.js";
import { transformSiapsPublicoPraticasAssistenciaisTab1 } from "./transformers/siaps/siapsPublicoPraticasAssistenciaisTab1Transformer.js";
import { transformSiapsPublicoPraticasAssistenciaisTab2 } from "./transformers/siaps/siapsPublicoPraticasAssistenciaisTab2Transformer.js";
import { transformSiapsPublicoPraticasAssistenciaisTab3 } from "./transformers/siaps/siapsPublicoPraticasAssistenciaisTab3Transformer.js";
import { transformSiapsPublicoPraticasAssistenciaisTab4 } from "./transformers/siaps/siapsPublicoPraticasAssistenciaisTab4Transformer.js";
import { transformSiapsPublico } from "./transformers/siaps/siapsPublicoTransformer.js";

const logger = new_logger(import.meta.url);

interface TransformTask {
    name: string;
    execute: () => Promise<unknown>;
}

const TRANSFORM_TASKS: readonly TransformTask[] = [
    { name: "GerenciaapsAusenciaEnvioProducao", execute: transformGerenciaapsAusenciaEnvioProducao },
    { name: "GerenciaapsPagamento", execute: transformGerenciaapsPagamento },
    { name: "GerenciaapsPagamentoHistorico", execute: transformGerenciaapsPagamentoHistorico },
    { name: "GerenciaapsInesCnesHomologados", execute: transformGerenciaapsInesCnesHomologados },
    { name: "GestaofederalPublicoRelatorioSolicitacoes", execute: transformGestaofederalPublicoRelatorioSolicitacoes },
    { name: "GerenciaapsSolicitacoesAdesao", execute: transformGerenciaapsSolicitacoesAdesao },
    { name: "GerenciaapsOutrosIncentivos", execute: transformGerenciaapsOutrosIncentivos },
    { name: "CoberturaAps", execute: transformCoberturaAps },
    { name: "CoberturaApsHistorico", execute: transformCoberturaApsHistorico },
    { name: "CoberturaSaudeBucalV2", execute: transformCoberturaSaudeBucalV2 },
    { name: "CoberturaSaudeBucalV2Historico", execute: transformCoberturaSaudeBucalV2Historico },
    { name: "CoberturaAcs", execute: transformCoberturaAcs },
    { name: "MapasSus", execute: transformMapasSus },
    { name: "RelHistoricoPagamentoEsf", execute: transformRelHistoricoPagamentoEsf },
    { name: "RelHistoricoPagamentoOutros", execute: transformRelHistoricoPagamentoOutros },
    { name: "AcoesEProgramasAdesaoPse", execute: transformAcoesEProgramasAdesaoPse },
    { name: "AcoesEProgramasHomologacaoSaudeComAgente", execute: transformAcoesEProgramasHomologacaoSaudeComAgente },
    { name: "SisabValidacao", execute: transformSisabValidacao },
    { name: "AcoesEProgramasIndicadorPainel", execute: transformAcoesEProgramasIndicadorPainel },
    { name: "AcoesEProgramasIndicadorCadastro", execute: transformAcoesEProgramasIndicadorCadastro },
    { name: "AcoesEProgramasSaudeProducao", execute: transformAcoesEProgramasSaudeProducao },
    { name: "AcoesEProgramasIndicadorPrenatal", execute: transformAcoesEProgramasIndicadorPrenatal },
    { name: "AcoesEProgramasSaudeAtividadeColetiva", execute: transformAcoesEProgramasSaudeAtividadeColetiva },
    { name: "AcoesEProgramasDescontinuadosInformatizaAps", execute: transformAcoesEProgramasDescontinuadosInformatizaAps },
    { name: "AcoesEProgramasRelpagamentopmaq", execute: transformAcoesEProgramasRelpagamentopmaq },
    { name: "AcoesEProgramasDescontinuadosAdesaoSaudeHora", execute: transformAcoesEProgramasDescontinuadosAdesaoSaudeHora },
    { name: "SiapsPublico", execute: transformSiapsPublico },
    { name: "SiapsPublicoPraticasAssistenciaisAtendimentosIndividuais", execute: transformSiapsPublicoPraticasAssistenciaisAtendimentosIndividuais },
    { name: "SiapsPublicoPraticasAssistenciaisTab1", execute: transformSiapsPublicoPraticasAssistenciaisTab1 },
    { name: "SiapsPublicoPraticasAssistenciaisTab2", execute: transformSiapsPublicoPraticasAssistenciaisTab2 },
    { name: "SiapsPublicoPraticasAssistenciaisTab3", execute: transformSiapsPublicoPraticasAssistenciaisTab3 },
    { name: "SiapsPublicoPraticasAssistenciaisTab4", execute: transformSiapsPublicoPraticasAssistenciaisTab4 },
];

export async function runTransformers(): Promise<void> {
    const log = logger.forMethod("runTransformers");
    log.info(`Iniciando execução de ${TRANSFORM_TASKS.length} transformers...`);

    let successCount = 0;
    let failureCount = 0;

    for (const [index, { name, execute }] of TRANSFORM_TASKS.entries()) {
        const step = `[${index + 1}/${TRANSFORM_TASKS.length}]`;
        log.info(`${step} Iniciando transformer: ${name}`);

        try {
            await execute();
            successCount++;
            log.info(`${step} Finalizado com sucesso: ${name}`);
        } catch (error) {
            failureCount++;
            log.error(
                { data: formatError(error) },
                `${step} Falha ao executar transformer: ${name}. Continuando para os próximos...`
            );
        }
    }

    log.info(
        `Processo de transformação concluído! Sucessos: ${successCount}, Falhas: ${failureCount}, Total: ${TRANSFORM_TASKS.length}`
    );
}