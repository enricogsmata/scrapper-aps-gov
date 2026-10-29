// src/pipeline_silver/transformer.ts
import { new_logger } from "../services/logs.js";
import { seedEstados } from "./transformers/seed_estados.js";
import { seedMunicipios } from "./transformers/seed_municipios.js";
import { transformCoberturaAps } from "./transformers/cobertura_aps.js";
import { transformCoberturaApsHistorico } from "./transformers/cobertura_aps_historico.js";
import { transformCoberturaSaudeBucalV2 } from "./transformers/cobertura_saude_bucal_v2.js";
import { transformCoberturaSaudeBucalV2Historico } from "./transformers/cobertura_saude_bucal_v2_historico.js";
import { transformCoberturaAcs } from "./transformers/cobertura_acs.js";
import { transformSisabValidacao } from "./transformers/sisab_validacao.js";
import { transformAcoesEProgramasIndicadorPainel } from "./transformers/acoes_e_programas_indicador_painel.js";
import { transformAcoesEProgramasIndicadorCadastro } from "./transformers/acoes_e_programas_indicador_cadastro.js";
import { transformAcoesEProgramasSaudeProducao } from "./transformers/acoes_e_programas_saude_producao.js";
import { transformAcoesEProgramasIndicadorPrenatal } from "./transformers/acoes_e_programas_indicador_prenatal.js";
import { transformAcoesEProgramasSaudeAtividadeColetiva } from "./transformers/acoes_e_programas_saude_atividade_coletiva.js";
import { transformSiapsPublicoPraticasAssistenciaisAtendimentosIndividuais } from "./transformers/siaps_publico_praticas_assistenciais_atendimentos_individuais.js";
import { transformSiapsPublicoPraticasAssistenciaisTab1 } from "./transformers/siaps_publico_praticas_assistenciais_tab_1.js";
import { transformSiapsPublicoPraticasAssistenciaisTab2 } from "./transformers/siaps_publico_praticas_assistenciais_tab_2.js";
import { transformSiapsPublicoPraticasAssistenciaisTab3 } from "./transformers/siaps_publico_praticas_assistenciais_tab_3.js";
import { transformSiapsPublicoPraticasAssistenciaisTab4 } from "./transformers/siaps_publico_praticas_assistenciais_tab_4.js";
import { transformMapasSusUnidadesCnesRealocadas } from "./transformers/mapas_sus_unidades_cnes_realocadas.js";
import { transformGerenciaapsInesCnesHomologados } from "./transformers/gerenciaaps_ines_cnes_homologados.js";
import { transformAcoesEProgramasAdesaoPse } from "./transformers/acoes_e_programas_adesao_pse.js";
import { transformGerenciaapsAusenciaEnvioProducao } from "./transformers/gerenciaaps_ausencia_envio_producao.js";
import { transformGerenciaapsPagamento } from "./transformers/gerenciaaps_pagamento.js";
import { transformGerenciaapsOutrosIncentivosPrt32632019 } from "./transformers/gerenciaaps_outros_incentivos_prt_3263_2019.js";
import { transformGerenciaapsOutrosIncentivosPrt3312022 } from "./transformers/gerenciaaps_outros_incentivos_prt_331_2022.js";
import { transformGerenciaapsOutrosIncentivosPrt6502021 } from "./transformers/gerenciaaps_outros_incentivos_prt_650_2021.js";
import { transformGerenciaapsOutrosIncentivosPrt20102021 } from "./transformers/gerenciaaps_outros_incentivos_prt_2010_2021.js";
import { transformGerenciaapsOutrosIncentivosPrt39782021 } from "./transformers/gerenciaaps_outros_incentivos_prt_3978_2021.js";
import { transformAcoesEProgramasDescontinuadosInformatizaAps } from "./transformers/acoes_e_programas_descontinuados_informatiza_aps.js";
import { transformAcoesEProgramasDescontinuadosAdesaoSaudeHora } from "./transformers/acoes_e_programas_descontinuados_adesao_saude_hora.js";
import { transformGerenciaapsPagamentoHistorico } from "./transformers/gerenciaaps_pagamento_historico.js";
import { transformGestaofederalPublicoRelatorioSolicitacoes } from "./transformers/gestaofederal_publico_relatorio_solicitacoes.js";
import { transformGerenciaapsSolicitacoesAdesao } from "./transformers/gerenciaaps_solicitacoes_adesao.js";
import { transformRelHistoricoPagamentoEsf } from "./transformers/rel_historico_pagamento_esf.js";
import { transformRelHistoricoPagamentoOutros } from "./transformers/rel_historico_pagamento_outros.js";
import { transformAcoesEProgramasHomologacaoSaudeComAgente } from "./transformers/acoes_e_programas_homologacao_saude_com_agente.js";
import { transformAcoesEProgramasRelpagamentopmaq } from "./transformers/acoes_e_programas_relpagamentopmaq.js";
import { transformSiapsPublico } from "./transformers/siaps_publico.js";

const logger = new_logger(import.meta.url);

interface TransformerStep {
  name: string;
  run: () => Promise<void>;
}

const steps: TransformerStep[] = [
  { name: "seed_estados", run: seedEstados },
  { name: "seed_municipios", run: seedMunicipios },
  { name: "cobertura_aps", run: transformCoberturaAps },
  { name: "cobertura_aps_historico", run: transformCoberturaApsHistorico },
  { name: "cobertura_saude_bucal_v2", run: transformCoberturaSaudeBucalV2 },
  { name: "cobertura_saude_bucal_v2_historico", run: transformCoberturaSaudeBucalV2Historico },
  { name: "cobertura_acs", run: transformCoberturaAcs },
  { name: "sisab_validacao", run: transformSisabValidacao },
  { name: "acoes_e_programas_indicador_painel", run: transformAcoesEProgramasIndicadorPainel },
  { name: "acoes_e_programas_indicador_cadastro", run: transformAcoesEProgramasIndicadorCadastro },
  { name: "acoes_e_programas_saude_producao", run: transformAcoesEProgramasSaudeProducao },
  { name: "acoes_e_programas_indicador_prenatal", run: transformAcoesEProgramasIndicadorPrenatal },
  { name: "acoes_e_programas_saude_atividade_coletiva", run: transformAcoesEProgramasSaudeAtividadeColetiva },
  { name: "siaps_publico_praticas_assistenciais_atendimentos_individuais", run: transformSiapsPublicoPraticasAssistenciaisAtendimentosIndividuais },
  { name: "siaps_publico_praticas_assistenciais_tab_1", run: transformSiapsPublicoPraticasAssistenciaisTab1 },
  { name: "siaps_publico_praticas_assistenciais_tab_2", run: transformSiapsPublicoPraticasAssistenciaisTab2 },
  { name: "siaps_publico_praticas_assistenciais_tab_3", run: transformSiapsPublicoPraticasAssistenciaisTab3 },
  { name: "siaps_publico_praticas_assistenciais_tab_4", run: transformSiapsPublicoPraticasAssistenciaisTab4 },
  { name: "mapas_sus_unidades_cnes_realocadas", run: transformMapasSusUnidadesCnesRealocadas },
  { name: "gerenciaaps_ines_cnes_homologados", run: transformGerenciaapsInesCnesHomologados },
  { name: "acoes_e_programas_adesao_pse", run: transformAcoesEProgramasAdesaoPse },
  { name: "gerenciaaps_ausencia_envio_producao", run: transformGerenciaapsAusenciaEnvioProducao },
  { name: "gerenciaaps_pagamento", run: transformGerenciaapsPagamento },
  { name: "gerenciaaps_outros_incentivos_prt_3263_2019", run: transformGerenciaapsOutrosIncentivosPrt32632019 },
  { name: "gerenciaaps_outros_incentivos_prt_331_2022", run: transformGerenciaapsOutrosIncentivosPrt3312022 },
  { name: "gerenciaaps_outros_incentivos_prt_650_2021", run: transformGerenciaapsOutrosIncentivosPrt6502021 },
  { name: "gerenciaaps_outros_incentivos_prt_2010_2021", run: transformGerenciaapsOutrosIncentivosPrt20102021 },
  { name: "gerenciaaps_outros_incentivos_prt_3978_2021", run: transformGerenciaapsOutrosIncentivosPrt39782021 },
  { name: "acoes_e_programas_descontinuados_informatiza_aps", run: transformAcoesEProgramasDescontinuadosInformatizaAps },
  { name: "acoes_e_programas_descontinuados_adesao_saude_hora", run: transformAcoesEProgramasDescontinuadosAdesaoSaudeHora },
  { name: "gerenciaaps_pagamento_historico", run: transformGerenciaapsPagamentoHistorico },
  { name: "gestaofederal_publico_relatorio_solicitacoes", run: transformGestaofederalPublicoRelatorioSolicitacoes },
  { name: "gerenciaaps_solicitacoes_adesao", run: transformGerenciaapsSolicitacoesAdesao },
  { name: "rel_historico_pagamento_esf", run: transformRelHistoricoPagamentoEsf },
  { name: "rel_historico_pagamento_outros", run: transformRelHistoricoPagamentoOutros },
  { name: "acoes_e_programas_homologacao_saude_com_agente", run: transformAcoesEProgramasHomologacaoSaudeComAgente },
  { name: "acoes_e_programas_relpagamentopmaq", run: transformAcoesEProgramasRelpagamentopmaq },
  { name: "siaps_publico", run: transformSiapsPublico },
];

export async function runSilverPipeline(): Promise<void> {
  const log = logger.forMethod("runSilverPipeline");
  const startTime = Date.now();

  log.info({ data: [{ totalEtapas: steps.length }] }, "Iniciando orquestrador da pipeline Silver");

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const stepIndex = i + 1;
    const stepStartTime = Date.now();

    log.info(
      { data: [{ etapa: step.name, progresso: `${stepIndex}/${steps.length}` }] },
      `Executando etapa ${stepIndex} de ${steps.length}: ${step.name}`
    );

    try {
      await step.run();
      const stepDuration = Date.now() - stepStartTime;
      log.info(
        { data: [{ etapa: step.name, duracaoMs: stepDuration }] },
        `Etapa concluída: ${step.name}`
      );
    } catch (error) {
      const stepDuration = Date.now() - stepStartTime;
      log.error(
        { data: [{ etapa: step.name, duracaoMs: stepDuration, erro: error }] },
        `Falha na execução da etapa: ${step.name}`
      );
      throw error;
    }
  }

  const totalDuration = Date.now() - startTime;
  log.info(
    { data: [{ totalEtapas: steps.length, duracaoTotalMs: totalDuration }] },
    "Pipeline Silver finalizada com sucesso"
  );
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))) {
  runSilverPipeline()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}