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

export const coberturaAps = mysqlTable("cobertura_aps", {
  id: serial("id").primaryKey(),
  compCnes: text("comp_cnes"),
  populacao: text("populacao"),
  qtEsf: text("qt_esf"),
  qtEap20hs: text("qt_eap_20hs"),
  qtEap30hs: text("qt_eap_30hs"),
  qtEcr: text("qt_ecr"),
  qtCadastroEcr: text("qt_cadastro_ecr"),
  qtEapp20hs: text("qt_eapp_20hs"),
  qtCadastroEapp20hs: text("qt_cadastro_eapp_20hs"),
  qtEapp30hs: text("qt_eapp_30hs"),
  qtCadastroEapp30hs: text("qt_cadastro_eapp_30hs"),
  qtEsfr: text("qt_esfr"),
  qtCadastroEsfr: text("qt_cadastro_esfr"),
  qtCadastrosDasEcrEEapp: text("qt_cadastros_das_ecr_e_eapp"),
  qtCapacidadeDaEquipe: text("qt_capacidade_da_equipe"),
  coberturaAps: text("cobertura_aps"),
});

export const coberturaApsHistorico = mysqlTable("cobertura_aps_historico", {
  id: serial("id").primaryKey(),
  competenciaCnes: text("competencia_cnes"),
  populacao: text("populacao"),
  qtEapFinanciada: text("qt_eap_financiada"),
  qtEsfFinanciada: text("qt_esf_financiada"),
  qtCadastrosEapFinanciadas: text("qt_cadastros_eap_financiadas"),
  qtCadastrosEsfFinanciadas: text("qt_cadastros_esf_financiadas"),
  qtTotalDeCadastrosLimPopIbge: text("qt_total_de_cadastros_lim_pop_ibge"),
  coberturaAps: text("cobertura_aps"),
});

export const coberturaSaudeBucalV2 = mysqlTable("cobertura_saude_bucal_v2", {
  id: serial("id").primaryKey(),
  compCnes: text("comp_cnes"),
  populacao: text("populacao"),
  anoDeReferencia: text("ano_de_referencia"),
  qtEsb40h: text("qt_esb_40h"),
  qtEsb30h: text("qt_esb_30h"),
  qtEsb20h: text("qt_esb_20h"),
  qtParametroCadastroEquipeSb: text("qt_parametro_cadastro_equipe_sb"),
  coberturaSbSf: text("cobertura_sb_sf"),
  qtEsfr: text("qt_esfr"),
  qtEcr: text("qt_ecr"),
  qtEapp: text("qt_eapp"),
  qtSisabCadastroEquipeEsfrEcrEapp: text("qt_sisab_cadastro_equipe_esfr_ecr_eapp"),
  qtParametroCadastroEquipeSbAps: text("qt_parametro_cadastro_equipe_sb_aps"),
  coberturaSbAps: text("cobertura_sb_aps"),
});

export const coberturaAcs = mysqlTable("cobertura_acs", {
  id: serial("id").primaryKey(),
  compCnes: text("comp_cnes"),
  populacao: text("populacao"),
  qtAcsAtiva: text("qt_acs_ativa"),
  qtAcsCobertura: text("qt_acs_cobertura"),
  qtPopulacaoCoberta: text("qt_populacao_coberta"),
  coberturaAcs: text("cobertura_acs"),
});

export const coberturaSaudeBucalV2Historico = mysqlTable(
  "cobertura_saude_bucal_v2_historico",
  {
    id: serial("id").primaryKey(),
    compCnes: text("comp_cnes"),
    populacao: text("populacao"),
    numEsfsbCob: text("num_esfsb_cob"),
    estimPopCobEsfsb: text("estim_pop_cob_esfsb"),
    coberturaEsfsb: text("cobertura_esfsb"),
    estimPopCobSbAb: text("estim_pop_cob_sb_ab"),
    coberturaSbAb: text("cobertura_sb_ab"),
  }
);

export const mapasSusUnidadesCnesRealocadas = mysqlTable(
  "mapas_sus_unidades_cnes_realocadas",
  {
    id: serial("id").primaryKey(),
    geometry: text("geometry"),
    latitude: text("latitude"),
    longitude: text("longitude"),
    coEquipe: text("co_equipe"),
    sgEquipe: text("sg_equipe"),
    coSubTipoEquipe: text("co_sub_tipo_equipe"),
    tpEquipe: text("tp_equipe"),
    dsEquipe: text("ds_equipe"),
    dsTipoEquipe: text("ds_tipo_equipe"),
    dsValidacaoComposicacao: text("ds_validacao_composicacao"),
    modalidadde: text("modalidadde"),
    equipesVinculadas: text("equipes_vinculadas"),
    noReferencia: text("no_referencia"),
    coArea: text("co_area"),
    coCnes: text("co_cnes"),
    noFantasia: text("no_fantasia"),
    noLogradouro: text("no_logradouro"),
    coCep: text("co_cep"),
    tpUnidade: text("tp_unidade"),
    dsTipoUnidade: text("ds_tipo_unidade"),
    coTurnoAtendimento: text("co_turno_atendimento"),
    coMunicipio: text("co_municipio"),
    noMunicipio: text("no_municipio"),
    coRegint: text("co_regint"),
    coMicrorregiao: text("co_microrregiao"),
    coRegiaoSaude: text("co_regiao_saude"),
    noRegiaoSaude: text("no_regiao_saude"),
    coMacrorregional: text("co_macrorregional"),
    noMacrorregional: text("no_macrorregional"),
    coUfIbge: text("co_uf_ibge"),
    sgUf: text("sg_uf"),
    noUf: text("no_uf"),
    noRegiao: text("no_regiao"),
    cadastrosAcompanhados: text("cadastros_acompanhados"),
    cadastrosVinculados: text("cadastros_vinculados"),
    pct: text("pct"),
    indigenas: text("indigenas"),
    ribeirinhos: text("ribeirinhos"),
    quilombolas: text("quilombolas"),
    pescadores: text("pescadores"),
    assentada: text("assentada"),
    parametroCadastral: text("parametro_cadastral"),
    cadastrosPrevine: text("cadastros_previne"),
    nuPopulacao: text("nu_populacao"),
    nuAnoPopulacao: text("nu_ano_populacao"),
    tipologia: text("tipologia"),
    stCapital: text("st_capital"),
    stAmazonia: text("st_amazonia"),
    stFronteira: text("st_fronteira"),
    stAtiva: text("st_ativa"),
    stEquipeValida: text("st_equipe_valida"),
    latitude1: text("latitude_1"),
    longitude1: text("longitude_1"),
    dentroMunicipio: text("dentro_municipio"),
  }
);

export const relHistoricoPagamentoEsf = mysqlTable(
  "rel_historico_pagamento_esf",
  {
    id: serial("id").primaryKey(),
    ano: text("ano"),
    mes: text("mes"),
    uf: text("uf"),
    codigo: text("codigo"),
    municipio: text("municipio"),
    populacao: text("populacao"),
    competencia: text("competencia"),
    tetoDeAcs: text("teto_de_acs"),
    acsQualificados: text("acs_qualificados"),
    acsNoSiab: text("acs_no_siab"),
    acsImplantado: text("acs_implantado"),
    popAcs: text("pop_acs"),
    pctAcs: text("pct_acs"),
    incentivoAoPacs: text("incentivo_ao_pacs"),
    tetoDeEsf: text("teto_de_esf"),
    esfQualificadas: text("esf_qualificadas"),
    esfNoSiab: text("esf_no_siab"),
    esfImplantada: text("esf_implantada"),
    pctCobertura: text("pct_cobertura"),
    popAcomp: text("pop_acomp"),
    incentivoAoPsf: text("incentivo_ao_psf"),
    iaPsf: text("ia_psf"),
    esbMod1Qualificadas: text("esb_mod_1_qualificadas"),
    esbMod1Siab: text("esb_mod_1_siab"),
    esbMod1Implantada: text("esb_mod_1_implantada"),
    incentivoMod1: text("incentivo_mod_1"),
    esbMod2Qualificadas: text("esb_mod_2_qualificadas"),
    esbMod2Siab: text("esb_mod_2_siab"),
    esbMod2Implantada: text("esb_mod_2_implantada"),
    incentivoMod2: text("incentivo_mod_2"),
    popEsb: text("pop_esb"),
    pctEsb: text("pct_esb"),
    incentivoAdicional: text("incentivo_adicional"),
    nasf1Cred: text("nasf_1_cred"),
    nasf1Sistema: text("nasf_1_sistema"),
    nasf1Pago: text("nasf_1_pago"),
    nasf1Valor: text("nasf_1_valor"),
    nasf2Cred: text("nasf_2_cred"),
    nasf2Sistema: text("nasf_2_sistema"),
    nasf2Pago: text("nasf_2_pago"),
    nasf2Valor: text("nasf_2_valor"),
    nasf3Cred: text("nasf_3_cred"),
    nasf3Sistema: text("nasf_3_sistema"),
    nasf3Pago: text("nasf_3_pago"),
    nasf3Valor: text("nasf_3_valor"),
    nasfIncAdicional: text("nasf_inc_adicional"),
    ufComp: text("uf_comp"),
    mun6: text("mun_6"),
  }
);

export const relHistoricoPagamentoOutros = mysqlTable(
  "rel_historico_pagamento_outros",
  {
    id: serial("id").primaryKey(),
    ibge: text("ibge"),
    uf: text("uf"),
    municipio: text("municipio"),
    financeira: text("financeira"),
    cnrICreden: text("cnr_i_creden"),
    cnrIiCreden: text("cnr_ii_creden"),
    cnrIiiCreden: text("cnr_iii_creden"),
    cnrIInformado: text("cnr_i_informado"),
    cnrIiInformado: text("cnr_ii_informado"),
    cnrIiiInformado: text("cnr_iii_informado"),
    cnrIPago: text("cnr_i_pago"),
    cnrIiPago: text("cnr_ii_pago"),
    cnrIiiPago: text("cnr_iii_pago"),
    microscopistaCred: text("microscopista_cred"),
    microscopistaInformados: text("microscopista_informados"),
    microscopistaPago: text("microscopista_pago"),
    uomCred: text("uom_cred"),
    uomInformado: text("uom_informado"),
    uomPago: text("uom_pago"),
    ubsfCred: text("ubsf_cred"),
    ubsfsbCred: text("ubsfsb_cred"),
    ubsfComEsffInformado: text("ubsf_com_esff_informado"),
    ubsfComEsffsbInformado: text("ubsf_com_esffsb_informado"),
    ubsfComEsffMmInformado: text("ubsf_com_esff_mm_informado"),
    ubsfComEsffsbMmInformado: text("ubsf_com_esffsb_mm_informado"),
    ubsfPago: text("ubsf_pago"),
    gestaoCred: text("gestao_cred"),
    eabpCred: text("eabp_cred"),
    eabpInformado: text("eabp_informado"),
    eabpPago: text("eabp_pago"),
  }
);

export const acoesEProgramasAdesaoPse = mysqlTable(
  "acoes_e_programas_adesao_pse",
  {
    id: serial("id").primaryKey(),
    uf: text("uf"),
    municipio: text("municipio"),
    ibge: text("ibge"),
    ciclo: text("ciclo"),
    tipoDeLocalizacao: text("tipo_de_localizacao"),
    localizacaoDiferenciada: text("localizacao_diferenciada"),
    esferaAdministrativa: text("esfera_administrativa"),
    inep: text("inep"),
    nomeDaEscola: text("nome_da_escola"),
    quantidadeEducandos: text("quantidade_educandos"),
    quantidadeCreche: text("quantidade_creche"),
    quantidadePreEscola: text("quantidade_pre_escola"),
    quantidadeFundamental: text("quantidade_fundamental"),
    quantidadeMedio: text("quantidade_medio"),
    quantidadeProfissional: text("quantidade_profissional"),
    quantidadeEja: text("quantidade_eja"),
    situacaoAdesao: text("situacao_adesao"),
    parteDoGrupoPrioritario: text("parte_do_grupo_prioritario"),
    possuiMaisDe50DosEducandosNoBfa: text("possui_mais_de_50_dos_educandos_no_bfa"),
    participaDoSistemaNacionalDeAcompanhamentoDeMedidasSocioeducativas: text("part_sis_nac_acomp_medidas_socioeducativas"),
    participouDoNutrisus: text("participou_do_nutrisus"),
    aderiuAoProgramaDeObesidade: text("aderiu_ao_programa_de_obesidade"),
  }
);

export const acoesEProgramasHomologacaoSaudeComAgente = mysqlTable(
  "acoes_e_programas_homologacao_saude_com_agente",
  {
    id: serial("id").primaryKey(),
    ibge: text("ibge"),
    municipio: text("municipio"),
    uf: text("uf"),
    nomeDoAgente: text("nome_do_agente"),
    curso: text("curso"),
    vinculo: text("vinculo"),
    dataDeFinalizacao: text("data_de_finalizacao"),
  }
);

export const sisabValidacao = mysqlTable("sisab_validacao", {
  id: serial("id").primaryKey(),
  validacao: text("validacao"),
  total: text("total"),
});

export const acoesEProgramasIndicadorPainel = mysqlTable(
  "acoes_e_programas_indicador_painel",
  {
    id: serial("id").primaryKey(),
    preNatal6Consultas: text("pre_natal_6_consultas"),
    preNatalSifilisEHiv: text("pre_natal_sifilis_e_hiv"),
    gestantesSaudeBucal: text("gestantes_saude_bucal"),
    coberturaCitopatologico: text("cobertura_citopatologico"),
    coberturaPolioEPenta: text("cobertura_polio_e_penta"),
    hipertensaoPaAferida: text("hipertensao_pa_aferida"),
    diabetesHemoglobinaGlicada: text("diabetes_hemoglobina_glicada"),
  }
);

export const acoesEProgramasIndicadorCadastro = mysqlTable(
  "acoes_e_programas_indicador_cadastro",
  {
    id: serial("id").primaryKey(),
    competencia: text("competencia"),
    total: text("total"),
  }
);

export const acoesEProgramasSaudeProducao = mysqlTable(
  "acoes_e_programas_saude_producao",
  {
    id: serial("id").primaryKey(),
    brasil: text("brasil"),
    atendimentoIndividual: text("atendimento_individual"),
    atendimentoOdontologico: text("atendimento_odontologico"),
    procedimento: text("procedimento"),
    visitaDomiciliar: text("visita_domiciliar"),
  }
);

export const acoesEProgramasIndicadorPrenatal = mysqlTable(
  "acoes_e_programas_indicador_prenatal",
  {
    id: serial("id").primaryKey(),
    competencia: text("competencia"),
    totalGestantes: text("total_gestantes"),
  }
);

export const acoesEProgramasSaudeAtividadeColetiva = mysqlTable(
  "acoes_e_programas_saude_atividade_coletiva",
  {
    id: serial("id").primaryKey(),
    brasil: text("brasil"),
    quantidadeAtividade: text("quantidade_atividade"),
    numParticipantes: text("num_participantes"),
  }
);

export const acoesEProgramasDescontinuadosInformatizaAps = mysqlTable(
  "acoes_e_programas_descontinuados_informatiza_aps",
  {
    id: serial("id").primaryKey(),
    uf: text("uf"),
    municipio: text("municipio"),
    ibge: text("ibge"),
    ine: text("ine"),
    tipoDaEquipe: text("tipo_da_equipe"),
    subtipoDaEquipe: text("subtipo_da_equipe"),
    situacao: text("situacao"),
    portariaDeHomologacao: text("portaria_de_homologacao"),
    portariaDeCancelamento: text("portaria_de_cancelamento"),
  }
);

export const acoesEProgramasRelpagamentopmaq = mysqlTable(
  "acoes_e_programas_relpagamentopmaq",
  {
    id: serial("id").primaryKey(),
    competenciaCnes: text("competencia_cnes"),
    competenciaFinanceira: text("competencia_financeira"),
    uf: text("uf"),
    ibge: text("ibge"),
    municipio: text("municipio"),
    qntEsf: text("qnt_esf"),
    qntEsb: text("qnt_esb"),
    qntNasf: text("qnt_nasf"),
    valorEsf: text("valor_esf"),
    valorEsb: text("valor_esb"),
    valorNasf: text("valor_nasf"),
    subtotal: text("subtotal"),
    desconto: text("desconto"),
    total: text("total"),
  }
);

export const acoesEProgramasDescontinuadosAdesaoSaudeHora = mysqlTable(
  "acoes_e_programas_descontinuados_adesao_saude_hora",
  {
    id: serial("id").primaryKey(),
    uf: text("uf"),
    municipio: text("municipio"),
    ibge: text("ibge"),
    cnes: text("cnes"),
    tipoDaAdesao: text("tipo_da_adesao"),
    situacaoDaAdesao: text("situacao_da_adesao"),
    portariaDeAdesao: text("portaria_de_adesao"),
    portariaDeCancelamento: text("portaria_de_cancelamento"),
  }
);

