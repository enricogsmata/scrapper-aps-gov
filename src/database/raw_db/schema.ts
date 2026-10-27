// src/database/raw_db/schema.ts
import { mysqlTable, serial, text } from "drizzle-orm/mysql-core";

export const gerenciaapsAusenciaEnvioProducao = mysqlTable(
  "gerenciaaps_ausencia_envio_producao",
  {
    id: serial("id").primaryKey(),
    compCnes: text("comp_cnes"),
    uf: text("uf"),
    municipio: text("municipio"),
    ibge: text("ibge"),
    cnes: text("cnes"),
    tipoDeEstabelecimento: text("tipo_de_estabelecimento"),
    gestao: text("gestao"),
    situacaoDoEnvioDeProducao: text("situacao_do_envio_de_producao"),
  }
);

export const gerenciaapsPagamento = mysqlTable("gerenciaaps_pagamento", {
  id: serial("id").primaryKey(),
  data: text("data"),
  coUfIbge: text("co_uf_ibge"),
  sgUf: text("sg_uf"),
  coMunicipioIbge: text("co_municipio_ibge"),
  noMunicipio: text("no_municipio"),
  nuCompCnes: text("nu_comp_cnes"),
  nuParcela: text("nu_parcela"),
  coProcesso: text("co_processo"),
  total: text("total"),
  coSeqPlanoOrcamentario: text("co_seq_plano_orcamentario"),
  dsPlanoOrcamentario: text("ds_plano_orcamentario"),
  dsGestao: text("ds_gestao"),
  vlTotalCusteio: text("vl_total_custeio"),
  vlTotalImplantacao: text("vl_total_implantacao"),
  valorIntegral: text("valor_integral"),
  ajuste: text("ajuste"),
  desconto: text("desconto"),
  valorEfetivoRepasse: text("valor_efetivo_repasse"),
  valorImplantacao: text("valor_implantacao"),
  ajusteImplantacao: text("ajuste_implantacao"),
  descontoImplantacao: text("desconto_implantacao"),
});

export const gerenciaapsPagamentoHistorico = mysqlTable(
  "gerenciaaps_pagamento_historico",
  {
    id: serial("id").primaryKey(),
    uf: text("uf"),
    municipio: text("municipio"),
    ibge: text("ibge"),
    compCnes: text("comp_cnes"),
    parcela: text("parcela"),
    tipologia: text("tipologia"),
    populacao: text("populacao"),
    credenciadasEsf: text("credenciadas_esf"),
    credenciadasEap: text("credenciadas_eap"),
    homologadasEsf: text("homologadas_esf"),
    homologadasEap: text("homologadas_eap"),
    pagasEsf: text("pagas_esf"),
    pagasEap20h: text("pagas_eap_20h"),
    pagasEap30h: text("pagas_eap_30h"),
    calcCadastroEsfEap: text("calc_cadastro_esf_eap"),
    calcCadastroPotencial: text("calc_cadastro_potencial"),
    calcQtdeEsfQuadrimestre: text("calc_qtde_esf_quadrimestre"),
    calcQtdeEap20hQuadrimestre: text("calc_qtde_eap_20h_quadrimestre"),
    calcQtdeEap30hQuadrimestre: text("calc_qtde_eap_30h_quadrimestre"),
    calcQtdePopVulneravel: text("calc_qtde_pop_vulneravel"),
    calcQtdePopNaoVulneravel: text("calc_qtde_pop_nao_vulneravel"),
    calcQtdeCadastroPagamento: text("calc_qtde_cadastro_pagamento"),
    calcValorPontoVulneravel: text("calc_valor_ponto_vulneravel"),
    calcValorPontoNaoVulneravel: text("calc_valor_ponto_nao_vulneravel"),
    calcValorPontoPorEquipe: text("calc_valor_ponto_por_equipe"),
    calcValorPagamentoPorEquipeQuadrimestre: text("calc_valor_pagamento_por_equipe_quadrimestre"),
    compEsfCompletas: text("comp_esf_completas"),
    compEsfIncompletas75: text("comp_esf_incompletas_75"),
    compEsfIncompletas50: text("comp_esf_incompletas_50"),
    compEsfIncompletas25: text("comp_esf_incompletas_25"),
    compEap20hCompletas: text("comp_eap_20h_completas"),
    compEap20hIncompletas: text("comp_eap_20h_incompletas"),
    compEap30hCompletas: text("comp_eap_30h_completas"),
    compEap30hIncompletas: text("comp_eap_30h_incompletas"),
    compValorTotalPagamento: text("comp_valor_total_pagamento"),
    novasEsfCompletas: text("novas_esf_completas"),
    novasEsfIncompletas75: text("novas_esf_incompletas_75"),
    novasEsfIncompletas50: text("novas_esf_incompletas_50"),
    novasEsfIncompletas25: text("novas_esf_incompletas_25"),
    novasEap20hCompletas: text("novas_eap_20h_completas"),
    novasEap20hIncompletas: text("novas_eap_20h_incompletas"),
    novasEap30hCompletas: text("novas_eap_30h_completas"),
    novasEap30hIncompletas: text("novas_eap_30h_incompletas"),
    novasCadastroPotencial: text("novas_cadastro_potencial"),
    novasValorPagamentoPorEquipe: text("novas_valor_pagamento_por_equipe"),
    novasValorTotalPagamento: text("novas_valor_total_pagamento"),
    especificasQtdeEcr: text("especificas_qtde_ecr"),
    especificasCadastroEcr: text("especificas_cadastro_ecr"),
    especificasValorPontoEcr: text("especificas_valor_ponto_ecr"),
    especificasValorPagamentoEcr: text("especificas_valor_pagamento_ecr"),
    especificasQtdeEapp: text("especificas_qtde_eapp"),
    especificasCadastroEapp: text("especificas_cadastro_eapp"),
    especificasValorPontoEapp: text("especificas_valor_ponto_eapp"),
    especificasValorPagamentoEapp: text("especificas_valor_pagamento_eapp"),
    especificasQtdeEsfr: text("especificas_qtde_esfr"),
    especificasCadastroVulneravelEsfr: text("especificas_cadastro_vulneravel_esfr"),
    especificasCadastroNaoVulneravelEsfr: text("especificas_cadastro_nao_vulneravel_esfr"),
    especificasValorPontoVulneravelEsfrb: text("especificas_valor_ponto_vulneravel_esfrb"),
    especificasValorPontoNaoVulneravelEsfr: text("especificas_valor_ponto_nao_vulneravel_esfr"),
    especificasValorPagamentoVulneravelEsfr: text("especificas_valor_pagamento_vulneravel_esfr"),
    especificasValorPagamentoNaoVulneravelEsfr: text("especificas_valor_pagamento_nao_vulneravel_esfr"),
    valorCapitacaoPonderada: text("valor_capitacao_ponderada"),
    valorComplementacaoFinanceira: text("valor_complementacao_financeira"),
    ajusteAdicional: text("ajuste_adicional"),
    ajusteDesconto: text("ajuste_desconto"),
    valorTotal: text("valor_total"),
  }
);

export const gerenciaapsInesCnesHomologados = mysqlTable(
  "gerenciaaps_ines_cnes_homologados",
  {
    id: serial("id").primaryKey(),
    uf: text("uf"),
    municipio: text("municipio"),
    ibge: text("ibge"),
    ine: text("ine"),
    codigoDoTipoDeEquipe: text("codigo_do_tipo_de_equipe"),
    tipoDeEquipe: text("tipo_de_equipe"),
    subtipoDeEquipe: text("subtipo_de_equipe"),
    portaria: text("portaria"),
    esferaAdministrativa: text("esfera_administrativa"),
  }
);

export const gestaofederalPublicoRelatorioSolicitacoes = mysqlTable(
  "gestaofederal_publico_relatorio_solicitacoes",
  {
    id: serial("id").primaryKey(),
    uf: text("uf"),
    municipio: text("municipio"),
    ibge: text("ibge"),
    estrategia: text("estrategia"),
    qtdeSolicitada: text("qtde_solicitada"),
  }
);

export const gerenciaapsSolicitacoesAdesao = mysqlTable(
  "gerenciaaps_solicitacoes_adesao",
  {
    id: serial("id").primaryKey(),
    uf: text("uf"),
    municipio: text("municipio"),
    ibge: text("ibge"),
    gestao: text("gestao"),
    numeroDaSolicitacao: text("numero_da_solicitacao"),
    programa: text("programa"),
    situacaoDaAdesao: text("situacao_da_adesao"),
  }
);

export const gerenciaapsOutrosIncentivosPrt32632019 = mysqlTable(
  "gerenciaaps_outros_incentivos_prt_3263_2019",
  {
    id: serial("id").primaryKey(),
    uf: text("uf"),
    ibge: text("ibge"),
    municipio: text("municipio"),
    ine: text("ine"),
  }
);

export const gerenciaapsOutrosIncentivosPrt3312022 = mysqlTable(
  "gerenciaaps_outros_incentivos_prt_331_2022",
  {
    id: serial("id").primaryKey(),
    uf: text("uf"),
    municipio: text("municipio"),
    ibge: text("ibge"),
    compCnes: text("comp_cnes"),
    cnesSolicitado: text("cnes_solicitado"),
    tipoDaUnidade: text("tipo_da_unidade"),
    unidadeAtiva: text("unidade_ativa"),
    unidadeValida: text("unidade_valida"),
    classificacaoValidada: text("classificacao_validada"),
    qtdeDeMedicos: text("qtde_de_medicos"),
    qtdeDeEnfermeiros: text("qtde_de_enfermeiros"),
    qtdeDeTecnicoAuxiliarEnfermagem: text("qtde_de_tecnico_auxiliar_enfermagem"),
    cargaHorariaDeMedicos: text("carga_horaria_de_medicos"),
    cargaHorariaDeEnfermeiros: text("carga_horaria_de_enfermeiros"),
    cargaHorariaDeTecnicoAuxiliarEnfermagem: text("carga_horaria_de_tecnico_auxiliar_enfermagem"),
    cumpriuRequisitoCusteio: text("cumpriu_requisito_custeio"),
  }
);

export const gerenciaapsOutrosIncentivosPrt6502021 = mysqlTable(
  "gerenciaaps_outros_incentivos_prt_650_2021",
  {
    id: serial("id").primaryKey(),
    uf: text("uf"),
    municipio: text("municipio"),
    ibge: text("ibge"),
    compCnes: text("comp_cnes"),
    cnesSolicitado: text("cnes_solicitado"),
    tipoDaUnidade: text("tipo_da_unidade"),
    unidadeAtiva: text("unidade_ativa"),
    unidadeValida: text("unidade_valida"),
    classificacaoValidada: text("classificacao_validada"),
    qtdeDeMedicos: text("qtde_de_medicos"),
    qtdeDeEnfermeiros: text("qtde_de_enfermeiros"),
    qtdeDeTecnicoAuxiliarEnfermagem: text("qtde_de_tecnico_auxiliar_enfermagem"),
    cargaHorariaDeMedicos: text("carga_horaria_de_medicos"),
    cargaHorariaDeEnfermeiros: text("carga_horaria_de_enfermeiros"),
    cargaHorariaDeTecnicoAuxiliarEnfermagem: text("carga_horaria_de_tecnico_auxiliar_enfermagem"),
    cumpriuRequisitoCusteio: text("cumpriu_requisito_custeio"),
    contempladoPortaria650: text("contemplado_portaria_650"),
  }
);

export const gerenciaapsOutrosIncentivosPrt20102021 = mysqlTable(
  "gerenciaaps_outros_incentivos_prt_2010_2021",
  {
    id: serial("id").primaryKey(),
    uf: text("uf"),
    municipio: text("municipio"),
    ibge: text("ibge"),
    compCnes: text("comp_cnes"),
    cnesSolicitado: text("cnes_solicitado"),
    tipoDaUnidade: text("tipo_da_unidade"),
    unidadeAtiva: text("unidade_ativa"),
    unidadeValida: text("unidade_valida"),
    classificacaoValidada: text("classificacao_validada"),
    qtdeDeMedicos: text("qtde_de_medicos"),
    qtdeDeEnfermeiros: text("qtde_de_enfermeiros"),
    qtdeDeTecnicoAuxiliarEnfermagem: text("qtde_de_tecnico_auxiliar_enfermagem"),
    cargaHorariaDeMedicos: text("carga_horaria_de_medicos"),
    cargaHorariaDeEnfermeiros: text("carga_horaria_de_enfermeiros"),
    cargaHorariaDeTecnicoAuxiliarEnfermagem: text("carga_horaria_de_tecnico_auxiliar_enfermagem"),
    cumpriuRequisitoCusteio: text("cumpriu_requisito_custeio"),
  }
);

export const gerenciaapsOutrosIncentivosPrt39782021 = mysqlTable(
  "gerenciaaps_outros_incentivos_prt_3978_2021",
  {
    id: serial("id").primaryKey(),
    uf: text("uf"),
    municipio: text("municipio"),
    ibge: text("ibge"),
    compCnes: text("comp_cnes"),
    cnesSolicitado: text("cnes_solicitado"),
    tipoDaUnidade: text("tipo_da_unidade"),
    unidadeAtiva: text("unidade_ativa"),
    unidadeValida: text("unidade_valida"),
    classificacaoValidada: text("classificacao_validada"),
    qtdeDeMedicos: text("qtde_de_medicos"),
    qtdeDeEnfermeiros: text("qtde_de_enfermeiros"),
    qtdeDeTecnicoAuxiliarEnfermagem: text("qtde_de_tecnico_auxiliar_enfermagem"),
    cargaHorariaDeMedicos: text("carga_horaria_de_medicos"),
    cargaHorariaDeEnfermeiros: text("carga_horaria_de_enfermeiros"),
    cargaHorariaDeTecnicoAuxiliarEnfermagem: text("carga_horaria_de_tecnico_auxiliar_enfermagem"),
    cumpriuRequisitoCusteio: text("cumpriu_requisito_custeio"),
  }
);