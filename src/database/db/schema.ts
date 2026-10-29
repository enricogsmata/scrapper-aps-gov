// src/database/db/schema.ts
import {
  mysqlTable,
  serial,
  int,
  bigint,
  varchar,
  char,
  text,
  decimal,
  boolean,
  timestamp,
  json,
  index,
  foreignKey,
} from "drizzle-orm/mysql-core";

// ==========================================
// 1. SISTEMA E LOGS
// ==========================================
export const Logs = mysqlTable("logs", {
  module: text("module"),
  context: text("context"),
  message: text("message"),
  data: json("data"),
  level: text("level"),
  createdAt: timestamp("createdAt"),
});

// ==========================================
// 2. DIMENSÕES GEOGRÁFICAS E ADMINISTRATIVAS
// ==========================================

export const regioesSaude = mysqlTable(
  "regioes_saude",
  {
    codigo: varchar("codigo", { length: 20 }).primaryKey(),
    nome: varchar("nome", { length: 150 }).notNull(),
    ufSigla: char("uf_sigla", { length: 2 }),
  },
  (table) => [
    index("idx_reg_saude_uf").on(table.ufSigla),
    foreignKey({
      name: "fk_reg_saude_uf",
      columns: [table.ufSigla],
      foreignColumns: [estados.sigla],
    }),
  ]
);

export const estados = mysqlTable("estados", {
  sigla: char("sigla", { length: 2 }).primaryKey(),
  codigoIbge: varchar("codigo_ibge", { length: 2 }).notNull().unique(),
  nome: varchar("nome", { length: 50 }).notNull(),
  regiao: varchar("regiao", { length: 20 }),
});

export const municipios = mysqlTable(
  "municipios",
  {
    codigoIbge: varchar("codigo_ibge", { length: 7 }).primaryKey(),
    codigoIbge6: varchar("codigo_ibge_6", { length: 6 }),
    nome: varchar("nome", { length: 150 }).notNull(),
    ufSigla: char("uf_sigla", { length: 2 }).notNull(),
    regiaoSaudeCodigo: varchar("regiao_saude_codigo", { length: 20 }),
    codigoRegint: varchar("codigo_regint", { length: 20 }),
    codigoMicrorregiao: varchar("codigo_microrregiao", { length: 20 }),
    codigoMacrorregional: varchar("codigo_macrorregional", { length: 20 }),
    nomeMacrorregional: varchar("nome_macrorregional", { length: 100 }),
    tipologia: varchar("tipologia", { length: 50 }),
    populacao: int("populacao"),
    stCapital: boolean("st_capital").default(false),
    stAmazonia: boolean("st_amazonia").default(false),
    stFronteira: boolean("st_fronteira").default(false),
  },
  (table) => [
    index("idx_mun_uf").on(table.ufSigla),
    index("idx_mun_ibge6").on(table.codigoIbge6),
    index("idx_mun_reg_saude").on(table.regiaoSaudeCodigo),
    foreignKey({
      name: "fk_mun_uf",
      columns: [table.ufSigla],
      foreignColumns: [estados.sigla],
    }),
    foreignKey({
      name: "fk_mun_reg_saude",
      columns: [table.regiaoSaudeCodigo],
      foreignColumns: [regioesSaude.codigo],
    }),
  ]
);

// ==========================================
// 3. DIMENSÕES DE ENTIDADES (ESTABELECIMENTOS, EQUIPES, ESCOLAS, PROGRAMAS)
// ==========================================

export const estabelecimentosSaude = mysqlTable(
  "estabelecimentos_saude",
  {
    codigoCnes: varchar("codigo_cnes", { length: 20 }).primaryKey(),
    nomeFantasia: varchar("nome_fantasia", { length: 255 }),
    municipioIbge: varchar("municipio_ibge", { length: 7 }).notNull(),
    tipoUnidadeCodigo: varchar("tipo_unidade_codigo", { length: 10 }),
    tipoUnidadeDescricao: varchar("tipo_unidade_descricao", { length: 150 }),
    tipoEstabelecimento: varchar("tipo_estabelecimento", { length: 150 }),
    logradouro: varchar("logradouro", { length: 255 }),
    cep: varchar("cep", { length: 10 }),
    turnoAtendimento: varchar("turno_atendimento", { length: 20 }),
    latitude: varchar("latitude", { length: 50 }),
    longitude: varchar("longitude", { length: 50 }),
    geometry: text("geometry"),
  },
  (table) => [
    index("idx_est_mun").on(table.municipioIbge),
    foreignKey({
      name: "fk_est_mun",
      columns: [table.municipioIbge],
      foreignColumns: [municipios.codigoIbge],
    }),
  ]
);

export const tiposEquipe = mysqlTable("tipos_equipe", {
  codigo: varchar("codigo", { length: 10 }).primaryKey(),
  sigla: varchar("sigla", { length: 20 }),
  nome: varchar("nome", { length: 150 }).notNull(),
  subtipo: varchar("subtipo", { length: 100 }),
});

export const equipesSaude = mysqlTable(
  "equipes_saude",
  {
    codigoIne: varchar("codigo_ine", { length: 20 }).primaryKey(),
    codigoCnes: varchar("codigo_cnes", { length: 20 }),
    municipioIbge: varchar("municipio_ibge", { length: 7 }).notNull(),
    tipoEquipeCodigo: varchar("tipo_equipe_codigo", { length: 10 }),
    nomeReferencia: varchar("nome_referencia", { length: 150 }),
    areaCodigo: varchar("area_codigo", { length: 20 }),
    modalidade: varchar("modalidade", { length: 50 }),
    equipesVinculadas: int("equipes_vinculadas").default(0),
    esferaAdministrativa: varchar("esfera_administrativa", { length: 50 }),
    stAtiva: boolean("st_ativa").default(true),
    stEquipeValida: varchar("st_equipe_valida", { length: 10 }),
  },
  (table) => [
    index("idx_eq_cnes").on(table.codigoCnes),
    index("idx_eq_mun").on(table.municipioIbge),
    index("idx_eq_tipo").on(table.tipoEquipeCodigo),
    foreignKey({
      name: "fk_eq_cnes",
      columns: [table.codigoCnes],
      foreignColumns: [estabelecimentosSaude.codigoCnes],
    }),
    foreignKey({
      name: "fk_eq_mun",
      columns: [table.municipioIbge],
      foreignColumns: [municipios.codigoIbge],
    }),
    foreignKey({
      name: "fk_eq_tipo",
      columns: [table.tipoEquipeCodigo],
      foreignColumns: [tiposEquipe.codigo],
    }),
  ]
);

export const escolasPse = mysqlTable(
  "escolas_pse",
  {
    codigoInep: varchar("codigo_inep", { length: 20 }).primaryKey(),
    nomeEscola: varchar("nome_escola", { length: 255 }).notNull(),
    municipioIbge: varchar("municipio_ibge", { length: 7 }).notNull(),
    tipoLocalizacao: varchar("tipo_localizacao", { length: 50 }),
    localizacaoDiferenciada: varchar("localizacao_diferenciada", { length: 100 }),
    esferaAdministrativa: varchar("esfera_administrativa", { length: 50 }),
  },
  (table) => [
    index("idx_esc_mun").on(table.municipioIbge),
    foreignKey({
      name: "fk_esc_mun",
      columns: [table.municipioIbge],
      foreignColumns: [municipios.codigoIbge],
    }),
  ]
);

export const planosOrcamentarios = mysqlTable("planos_orcamentarios", {
  codigoSeq: varchar("codigo_seq", { length: 20 }).primaryKey(),
  descricao: varchar("descricao", { length: 255 }).notNull(),
});

export const portariasNormativas = mysqlTable("portarias_normativas", {
  id: serial("id").primaryKey(),
  numero: varchar("numero", { length: 50 }).notNull(),
  ano: int("ano"),
  descricao: varchar("descricao", { length: 255 }),
});

// ==========================================
// 4. FATOS / TRANSAÇÕES / HISTÓRICOS NORMALIZADOS
// ==========================================

export const gerenciaapsAusenciasEnvioProducao = mysqlTable(
  "gerenciaaps_ausencias_envio_producao",
  {
    id: serial("id").primaryKey(),
    compCnes: varchar("comp_cnes", { length: 10 }).notNull(),
    municipioIbge: varchar("municipio_ibge", { length: 7 }).notNull(),
    codigoCnes: varchar("codigo_cnes", { length: 20 }).notNull(),
    gestao: varchar("gestao", { length: 50 }),
    situacaoEnvioProducao: varchar("situacao_envio_producao", { length: 255 }),
  },
  (table) => [
    index("idx_gap_aus_comp").on(table.compCnes),
    index("idx_gap_aus_mun").on(table.municipioIbge),
    index("idx_gap_aus_cnes").on(table.codigoCnes),
    foreignKey({
      name: "fk_gap_aus_mun",
      columns: [table.municipioIbge],
      foreignColumns: [municipios.codigoIbge],
    }),
    foreignKey({
      name: "fk_gap_aus_cnes",
      columns: [table.codigoCnes],
      foreignColumns: [estabelecimentosSaude.codigoCnes],
    }),
  ]
);

export const gerenciaapsPagamentos = mysqlTable(
  "gerenciaaps_pagamentos",
  {
    id: serial("id").primaryKey(),
    dataPagamento: varchar("data_pagamento", { length: 10 }),
    ufSigla: char("uf_sigla", { length: 2 }),
    municipioIbge: varchar("municipio_ibge", { length: 7 }),
    compCnes: varchar("comp_cnes", { length: 10 }),
    parcela: varchar("parcela", { length: 10 }),
    codigoProcesso: varchar("codigo_processo", { length: 50 }),
    planoOrcamentarioSeq: varchar("plano_orcamentario_seq", { length: 20 }),
    gestao: varchar("gestao", { length: 50 }),
    total: decimal("total", { precision: 15, scale: 2 }),
    vlTotalCusteio: decimal("vl_total_custeio", { precision: 15, scale: 2 }),
    vlTotalImplantacao: decimal("vl_total_implantacao", { precision: 15, scale: 2 }),
    valorIntegral: decimal("valor_integral", { precision: 15, scale: 2 }),
    ajuste: decimal("ajuste", { precision: 15, scale: 2 }),
    desconto: decimal("desconto", { precision: 15, scale: 2 }),
    valorEfetivoRepasse: decimal("valor_efetivo_repasse", { precision: 15, scale: 2 }),
    valorImplantacao: decimal("valor_implantacao", { precision: 15, scale: 2 }),
    ajusteImplantacao: decimal("ajuste_implantacao", { precision: 15, scale: 2 }),
    descontoImplantacao: decimal("desconto_implantacao", { precision: 15, scale: 2 }),
  },
  (table) => [
    index("idx_gap_pag_comp").on(table.compCnes),
    index("idx_gap_pag_parc").on(table.parcela),
    index("idx_gap_pag_mun").on(table.municipioIbge),
    foreignKey({
      name: "fk_gap_pag_uf",
      columns: [table.ufSigla],
      foreignColumns: [estados.sigla],
    }),
    foreignKey({
      name: "fk_gap_pag_mun",
      columns: [table.municipioIbge],
      foreignColumns: [municipios.codigoIbge],
    }),
    foreignKey({
      name: "fk_gap_pag_plan",
      columns: [table.planoOrcamentarioSeq],
      foreignColumns: [planosOrcamentarios.codigoSeq],
    }),
  ]
);

export const gerenciaapsPagamentosHistorico = mysqlTable(
  "gerenciaaps_pagamentos_historico",
  {
    id: serial("id").primaryKey(),
    municipioIbge: varchar("municipio_ibge", { length: 7 }).notNull(),
    compCnes: varchar("comp_cnes", { length: 10 }).notNull(),
    parcela: varchar("parcela", { length: 10 }),
    populacao: int("populacao"),
    credenciadasEsf: int("credenciadas_esf"),
    credenciadasEap: int("credenciadas_eap"),
    homologadasEsf: int("homologadas_esf"),
    homologadasEap: int("homologadas_eap"),
    pagasEsf: int("pagas_esf"),
    pagasEap20h: int("pagas_eap_20h"),
    pagasEap30h: int("pagas_eap_30h"),
    calcCadastroEsfEap: int("calc_cadastro_esf_eap"),
    calcCadastroPotencial: int("calc_cadastro_potencial"),
    calcQtdeEsfQuadrimestre: int("calc_qtde_esf_quadrimestre"),
    calcQtdeEap20hQuadrimestre: int("calc_qtde_eap_20h_quadrimestre"),
    calcQtdeEap30hQuadrimestre: int("calc_qtde_eap_30h_quadrimestre"),
    calcQtdePopVulneravel: int("calc_qtde_pop_vulneravel"),
    calcQtdePopNaoVulneravel: int("calc_qtde_pop_nao_vulneravel"),
    calcQtdeCadastroPagamento: int("calc_qtde_cadastro_pagamento"),
    calcValorPontoVulneravel: decimal("calc_valor_ponto_vulneravel", { precision: 15, scale: 4 }),
    calcValorPontoNaoVulneravel: decimal("calc_valor_ponto_nao_vulneravel", { precision: 15, scale: 4 }),
    calcValorPontoPorEquipe: decimal("calc_valor_ponto_por_equipe", { precision: 15, scale: 4 }),
    calcValorPagamentoPorEquipeQuadrimestre: decimal("calc_valor_pagamento_por_equipe_quadrimestre", { precision: 15, scale: 2 }),
    compEsfCompletas: int("comp_esf_completas"),
    compEsfIncompletas75: int("comp_esf_incompletas_75"),
    compEsfIncompletas50: int("comp_esf_incompletas_50"),
    compEsfIncompletas25: int("comp_esf_incompletas_25"),
    compEap20hCompletas: int("comp_eap_20h_completas"),
    compEap20hIncompletas: int("comp_eap_20h_incompletas"),
    compEap30hCompletas: int("comp_eap_30h_completas"),
    compEap30hIncompletas: int("comp_eap_30h_incompletas"),
    compValorTotalPagamento: decimal("comp_valor_total_pagamento", { precision: 15, scale: 2 }),
    novasEsfCompletas: int("novas_esf_completas"),
    novasEsfIncompletas75: int("novas_esf_incompletas_75"),
    novasEsfIncompletas50: int("novas_esf_incompletas_50"),
    novasEsfIncompletas25: int("novas_esf_incompletas_25"),
    novasEap20hCompletas: int("novas_eap_20h_completas"),
    novasEap20hIncompletas: int("novas_eap_20h_incompletas"),
    novasEap30hCompletas: int("novas_eap_30h_completas"),
    novasEap30hIncompletas: int("novas_eap_30h_incompletas"),
    novasCadastroPotencial: int("novas_cadastro_potencial"),
    novasValorPagamentoPorEquipe: decimal("novas_valor_pagamento_por_equipe", { precision: 15, scale: 2 }),
    novasValorTotalPagamento: decimal("novas_valor_total_pagamento", { precision: 15, scale: 2 }),
    especificasQtdeEcr: int("especificas_qtde_ecr"),
    especificasCadastroEcr: int("especificas_cadastro_ecr"),
    especificasValorPontoEcr: decimal("especificas_valor_ponto_ecr", { precision: 15, scale: 4 }),
    especificasValorPagamentoEcr: decimal("especificas_valor_pagamento_ecr", { precision: 15, scale: 2 }),
    especificasQtdeEapp: int("especificas_qtde_eapp"),
    especificasCadastroEapp: int("especificas_cadastro_eapp"),
    especificasValorPontoEapp: decimal("especificas_valor_ponto_eapp", { precision: 15, scale: 4 }),
    especificasValorPagamentoEapp: decimal("especificas_valor_pagamento_eapp", { precision: 15, scale: 2 }),
    especificasQtdeEsfr: int("especificas_qtde_esfr"),
    especificasCadastroVulneravelEsfr: int("especificas_cadastro_vulneravel_esfr"),
    especificasCadastroNaoVulneravelEsfr: int("especificas_cadastro_nao_vulneravel_esfr"),
    especificasValorPontoVulneravelEsfrb: decimal("especificas_valor_ponto_vulneravel_esfrb", { precision: 15, scale: 4 }),
    especificasValorPontoNaoVulneravelEsfr: decimal("especificas_valor_ponto_nao_vulneravel_esfr", { precision: 15, scale: 4 }),
    especificasValorPagamentoVulneravelEsfr: decimal("especificas_valor_pagamento_vulneravel_esfr", { precision: 15, scale: 2 }),
    especificasValorPagamentoNaoVulneravelEsfr: decimal("especificas_valor_pagamento_nao_vulneravel_esfr", { precision: 15, scale: 2 }),
    valorCapitacaoPonderada: decimal("valor_capitacao_ponderada", { precision: 15, scale: 2 }),
    valorComplementacaoFinanceira: decimal("valor_complementacao_financeira", { precision: 15, scale: 2 }),
    ajusteAdicional: decimal("ajuste_adicional", { precision: 15, scale: 2 }),
    ajusteDesconto: decimal("ajuste_desconto", { precision: 15, scale: 2 }),
    valorTotal: decimal("valor_total", { precision: 15, scale: 2 }),
  },
  (table) => [
    index("idx_gap_pgh_mun").on(table.municipioIbge),
    index("idx_gap_pgh_comp").on(table.compCnes),
    foreignKey({
      name: "fk_gap_pgh_mun",
      columns: [table.municipioIbge],
      foreignColumns: [municipios.codigoIbge],
    }),
  ]
);

export const gerenciaapsEquipesHomologadas = mysqlTable(
  "gerenciaaps_equipes_homologadas",
  {
    id: serial("id").primaryKey(),
    codigoIne: varchar("codigo_ine", { length: 20 }).notNull(),
    municipioIbge: varchar("municipio_ibge", { length: 7 }).notNull(),
    tipoEquipeCodigo: varchar("tipo_equipe_codigo", { length: 10 }),
    portaria: varchar("portaria", { length: 255 }),
    esferaAdministrativa: varchar("esfera_administrativa", { length: 50 }),
  },
  (table) => [
    index("idx_gap_eqh_ine").on(table.codigoIne),
    index("idx_gap_eqh_mun").on(table.municipioIbge),
    foreignKey({
      name: "fk_gap_eqh_ine",
      columns: [table.codigoIne],
      foreignColumns: [equipesSaude.codigoIne],
    }),
    foreignKey({
      name: "fk_gap_eqh_mun",
      columns: [table.municipioIbge],
      foreignColumns: [municipios.codigoIbge],
    }),
    foreignKey({
      name: "fk_gap_eqh_tipo",
      columns: [table.tipoEquipeCodigo],
      foreignColumns: [tiposEquipe.codigo],
    }),
  ]
);

export const gestaofederalSolicitacoes = mysqlTable(
  "gestaofederal_solicitacoes",
  {
    id: serial("id").primaryKey(),
    municipioIbge: varchar("municipio_ibge", { length: 7 }).notNull(),
    estrategia: varchar("estrategia", { length: 150 }).notNull(),
    qtdeSolicitada: int("qtde_solicitada"),
  },
  (table) => [
    index("idx_gf_sol_mun").on(table.municipioIbge),
    foreignKey({
      name: "fk_gf_sol_mun",
      columns: [table.municipioIbge],
      foreignColumns: [municipios.codigoIbge],
    }),
  ]
);

export const gerenciaapsSolicitacoesAdesaoFato = mysqlTable(
  "gerenciaaps_solicitacoes_adesao_fato",
  {
    id: serial("id").primaryKey(),
    municipioIbge: varchar("municipio_ibge", { length: 7 }).notNull(),
    gestao: varchar("gestao", { length: 50 }),
    numeroSolicitacao: varchar("numero_solicitacao", { length: 50 }),
    programa: varchar("programa", { length: 150 }),
    situacaoAdesao: varchar("situacao_adesao", { length: 100 }),
  },
  (table) => [
    index("idx_gap_solad_mun").on(table.municipioIbge),
    foreignKey({
      name: "fk_gap_solad_mun",
      columns: [table.municipioIbge],
      foreignColumns: [municipios.codigoIbge],
    }),
  ]
);

export const incentivosEquipesPrt32632019 = mysqlTable(
  "incentivos_equipes_prt_3263_2019",
  {
    id: serial("id").primaryKey(),
    municipioIbge: varchar("municipio_ibge", { length: 7 }).notNull(),
    codigoIne: varchar("codigo_ine", { length: 20 }).notNull(),
  },
  (table) => [
    index("idx_inc3263_mun").on(table.municipioIbge),
    index("idx_inc3263_ine").on(table.codigoIne),
    foreignKey({
      name: "fk_inc3263_mun",
      columns: [table.municipioIbge],
      foreignColumns: [municipios.codigoIbge],
    }),
    foreignKey({
      name: "fk_inc3263_ine",
      columns: [table.codigoIne],
      foreignColumns: [equipesSaude.codigoIne],
    }),
  ]
);

export const incentivosCnesAvaliacoes = mysqlTable(
  "incentivos_cnes_avaliacoes",
  {
    id: serial("id").primaryKey(),
    portariaNormativaId: bigint("portaria_normativa_id", { mode: "number", unsigned: true }),
    portariaOrigem: varchar("portaria_origem", { length: 50 }).notNull(),
    municipioIbge: varchar("municipio_ibge", { length: 7 }).notNull(),
    codigoCnes: varchar("codigo_cnes", { length: 20 }).notNull(),
    compCnes: varchar("comp_cnes", { length: 10 }),
    cnesSolicitado: varchar("cnes_solicitado", { length: 20 }),
    tipoUnidade: varchar("tipo_unidade", { length: 10 }),
    unidadeAtiva: varchar("unidade_ativa", { length: 20 }),
    unidadeValida: varchar("unidade_valida", { length: 20 }),
    classificacaoValidada: varchar("classificacao_validada", { length: 50 }),
    qtdeMedicos: int("qtde_medicos").default(0),
    qtdeEnfermeiros: int("qtde_enfermeiros").default(0),
    qtdeTecnicoAuxiliarEnfermagem: int("qtde_tecnico_auxiliar_enfermagem").default(0),
    cargaHorariaMedicos: int("carga_horaria_medicos").default(0),
    cargaHorariaEnfermeiros: int("carga_horaria_enfermeiros").default(0),
    cargaHorariaTecnicoAuxiliarEnfermagem: int("carga_horaria_tecnico_auxiliar_enfermagem").default(0),
    cumpriuRequisitoCusteio: varchar("cumpriu_requisito_custeio", { length: 10 }),
    contempladoPortaria650: varchar("contemplado_portaria_650", { length: 10 }),
  },
  (table) => [
    index("idx_inc_cnes_mun").on(table.municipioIbge),
    index("idx_inc_cnes_est").on(table.codigoCnes),
    index("idx_inc_cnes_port").on(table.portariaOrigem),
    foreignKey({
      name: "fk_inc_cnes_port",
      columns: [table.portariaNormativaId],
      foreignColumns: [portariasNormativas.id],
    }),
    foreignKey({
      name: "fk_inc_cnes_mun",
      columns: [table.municipioIbge],
      foreignColumns: [municipios.codigoIbge],
    }),
    foreignKey({
      name: "fk_inc_cnes_est",
      columns: [table.codigoCnes],
      foreignColumns: [estabelecimentosSaude.codigoCnes],
    }),
  ]
);

// ==========================================
// 5. COBERTURA DA APS E HISTÓRICOS
// ==========================================

export const coberturaAps = mysqlTable("cobertura_aps", {
  id: serial("id").primaryKey(),
  compCnes: varchar("comp_cnes", { length: 10 }).notNull(),
  populacao: bigint("populacao", { mode: "number" }),
  qtEsf: int("qt_esf"),
  qtEap20hs: int("qt_eap_20hs"),
  qtEap30hs: int("qt_eap_30hs"),
  qtEcr: int("qt_ecr"),
  qtCadastroEcr: int("qt_cadastro_ecr"),
  qtEapp20hs: int("qt_eapp_20hs"),
  qtCadastroEapp20hs: int("qt_cadastro_eapp_20hs"),
  qtEapp30hs: int("qt_eapp_30hs"),
  qtCadastroEapp30hs: int("qt_cadastro_eapp_30hs"),
  qtEsfr: int("qt_esfr"),
  qtCadastroEsfr: int("qt_cadastro_esfr"),
  qtCadastrosDasEcrEEapp: int("qt_cadastros_das_ecr_e_eapp"),
  qtCapacidadeDaEquipe: bigint("qt_capacidade_da_equipe", { mode: "number" }),
  coberturaApsPercentual: decimal("cobertura_aps_percentual", { precision: 5, scale: 2 }),
});

export const coberturaApsHistorico = mysqlTable("cobertura_aps_historico", {
  id: serial("id").primaryKey(),
  competenciaCnes: varchar("competencia_cnes", { length: 15 }).notNull(),
  populacao: bigint("populacao", { mode: "number" }),
  qtEapFinanciada: int("qt_eap_financiada"),
  qtEsfFinanciada: int("qt_esf_financiada"),
  qtCadastrosEapFinanciadas: bigint("qt_cadastros_eap_financiadas", { mode: "number" }),
  qtCadastrosEsfFinanciadas: bigint("qt_cadastros_esf_financiadas", { mode: "number" }),
  qtTotalDeCadastrosLimPopIbge: bigint("qt_total_de_cadastros_lim_pop_ibge", { mode: "number" }),
  coberturaApsPercentual: decimal("cobertura_aps_percentual", { precision: 5, scale: 2 }),
});

export const coberturaSaudeBucalV2 = mysqlTable("cobertura_saude_bucal_v2", {
  id: serial("id").primaryKey(),
  compCnes: varchar("comp_cnes", { length: 15 }).notNull(),
  populacao: bigint("populacao", { mode: "number" }),
  anoDeReferencia: int("ano_de_referencia"),
  qtEsb40h: int("qt_esb_40h"),
  qtEsb30h: int("qt_esb_30h"),
  qtEsb20h: int("qt_esb_20h"),
  qtParametroCadastroEquipeSb: bigint("qt_parametro_cadastro_equipe_sb", { mode: "number" }),
  coberturaSbSfPercentual: decimal("cobertura_sb_sf_percentual", { precision: 5, scale: 2 }),
  qtEsfr: int("qt_esfr"),
  qtEcr: int("qt_ecr"),
  qtEapp: int("qt_eapp"),
  qtSisabCadastroEquipeEsfrEcrEapp: int("qt_sisab_cadastro_equipe_esfr_ecr_eapp"),
  qtParametroCadastroEquipeSbAps: bigint("qt_parametro_cadastro_equipe_sb_aps", { mode: "number" }),
  coberturaSbApsPercentual: decimal("cobertura_sb_aps_percentual", { precision: 5, scale: 2 }),
});

export const coberturaSaudeBucalV2Historico = mysqlTable(
  "cobertura_saude_bucal_v2_historico",
  {
    id: serial("id").primaryKey(),
    compCnes: varchar("comp_cnes", { length: 15 }).notNull(),
    populacao: bigint("populacao", { mode: "number" }),
    numEsfsbCob: int("num_esfsb_cob"),
    estimPopCobEsfsb: bigint("estim_pop_cob_esfsb", { mode: "number" }),
    coberturaEsfsbPercentual: decimal("cobertura_esfsb_percentual", { precision: 5, scale: 2 }),
    estimPopCobSbAb: bigint("estim_pop_cob_sb_ab", { mode: "number" }),
    coberturaSbAbPercentual: decimal("cobertura_sb_ab_percentual", { precision: 5, scale: 2 }),
  }
);

export const coberturaAcs = mysqlTable("cobertura_acs", {
  id: serial("id").primaryKey(),
  compCnes: varchar("comp_cnes", { length: 10 }).notNull(),
  populacao: bigint("populacao", { mode: "number" }),
  qtAcsAtiva: int("qt_acs_ativa"),
  qtAcsCobertura: int("qt_acs_cobertura"),
  qtPopulacaoCoberta: bigint("qt_populacao_coberta", { mode: "number" }),
  coberturaAcsPercentual: decimal("cobertura_acs_percentual", { precision: 5, scale: 2 }),
});

// ==========================================
// 6. MAPAS SUS - INDICADORES DE EQUIPES
// ==========================================

export const mapasSusEquipesIndicadores = mysqlTable(
  "mapas_sus_equipes_indicadores",
  {
    id: serial("id").primaryKey(),
    codigoEquipe: varchar("codigo_equipe", { length: 20 }).notNull(),
    codigoCnes: varchar("codigo_cnes", { length: 20 }).notNull(),
    municipioIbge: varchar("municipio_ibge", { length: 7 }).notNull(),
    cadastrosAcompanhados: int("cadastros_acompanhados").default(0),
    cadastrosVinculados: int("cadastros_vinculados").default(0),
    pct: decimal("pct", { precision: 8, scale: 2 }).default("0.00"),
    indigenas: int("indigenas").default(0),
    ribeirinhos: int("ribeirinhos").default(0),
    quilombolas: int("quilombolas").default(0),
    pescadores: int("pescadores").default(0),
    assentada: int("assentada").default(0),
    parametroCadastral: int("parametro_cadastral").default(0),
    cadastrosPrevine: int("cadastros_previne").default(0),
    dentroMunicipio: boolean("dentro_municipio").default(true),
  },
  (table) => [
    index("idx_msus_ind_eq").on(table.codigoEquipe),
    index("idx_msus_ind_cnes").on(table.codigoCnes),
    index("idx_msus_ind_mun").on(table.municipioIbge),
    foreignKey({
      name: "fk_msus_ind_ine",
      columns: [table.codigoEquipe],
      foreignColumns: [equipesSaude.codigoIne],
    }),
    foreignKey({
      name: "fk_msus_ind_cnes",
      columns: [table.codigoCnes],
      foreignColumns: [estabelecimentosSaude.codigoCnes],
    }),
    foreignKey({
      name: "fk_msus_ind_mun",
      columns: [table.municipioIbge],
      foreignColumns: [municipios.codigoIbge],
    }),
  ]
);

// ==========================================
// 7. HISTÓRICOS DE PAGAMENTO (ESF E OUTROS)
// ==========================================

export const relHistoricoPagamentoEsf = mysqlTable(
  "rel_historico_pagamento_esf",
  {
    id: serial("id").primaryKey(),
    municipioIbge: varchar("municipio_ibge", { length: 7 }).notNull(),
    ano: int("ano").notNull(),
    mes: int("mes").notNull(),
    competencia: varchar("competencia", { length: 15 }),
    populacao: int("populacao"),
    tetoDeAcs: int("teto_de_acs"),
    acsQualificados: int("acs_qualificados"),
    acsNoSiab: int("acs_no_siab"),
    acsImplantado: int("acs_implantado"),
    popAcs: int("pop_acs"),
    pctAcs: decimal("pct_acs", { precision: 5, scale: 2 }),
    incentivoAoPacs: decimal("incentivo_ao_pacs", { precision: 15, scale: 2 }),
    tetoDeEsf: int("teto_de_esf"),
    esfQualificadas: int("esf_qualificadas"),
    esfNoSiab: int("esf_no_siab"),
    esfImplantada: int("esf_implantada"),
    pctCobertura: decimal("pct_cobertura", { precision: 5, scale: 2 }),
    popAcomp: int("pop_acomp"),
    incentivoAoPsf: decimal("incentivo_ao_psf", { precision: 15, scale: 2 }),
    iaPsf: decimal("ia_psf", { precision: 15, scale: 2 }),
    esbMod1Qualificadas: int("esb_mod_1_qualificadas"),
    esbMod1Siab: int("esb_mod_1_siab"),
    esbMod1Implantada: int("esb_mod_1_implantada"),
    incentivoMod1: decimal("incentivo_mod_1", { precision: 15, scale: 2 }),
    esbMod2Qualificadas: int("esb_mod_2_qualificadas"),
    esbMod2Siab: int("esb_mod_2_siab"),
    esbMod2Implantada: int("esb_mod_2_implantada"),
    incentivoMod2: decimal("incentivo_mod_2", { precision: 15, scale: 2 }),
    popEsb: int("pop_esb"),
    pctEsb: decimal("pct_esb", { precision: 5, scale: 2 }),
    incentivoAdicional: decimal("incentivo_adicional", { precision: 15, scale: 2 }),
    nasf1Cred: int("nasf_1_cred"),
    nasf1Sistema: int("nasf_1_sistema"),
    nasf1Pago: int("nasf_1_pago"),
    nasf1Valor: decimal("nasf_1_valor", { precision: 15, scale: 2 }),
    nasf2Cred: int("nasf_2_cred"),
    nasf2Sistema: int("nasf_2_sistema"),
    nasf2Pago: int("nasf_2_pago"),
    nasf2Valor: decimal("nasf_2_valor", { precision: 15, scale: 2 }),
    nasf3Cred: int("nasf_3_cred"),
    nasf3Sistema: int("nasf_3_sistema"),
    nasf3Pago: int("nasf_3_pago"),
    nasf3Valor: decimal("nasf_3_valor", { precision: 15, scale: 2 }),
    nasfIncAdicional: decimal("nasf_inc_adicional", { precision: 15, scale: 2 }),
  },
  (table) => [
    index("idx_rhp_esf_mun").on(table.municipioIbge),
    index("idx_rhp_esf_ano_mes").on(table.ano, table.mes),
    foreignKey({
      name: "fk_rhp_esf_mun",
      columns: [table.municipioIbge],
      foreignColumns: [municipios.codigoIbge],
    }),
  ]
);

export const relHistoricoPagamentoOutros = mysqlTable(
  "rel_historico_pagamento_outros",
  {
    id: serial("id").primaryKey(),
    municipioIbge: varchar("municipio_ibge", { length: 7 }).notNull(),
    competenciaFinanceira: varchar("competencia_financeira", { length: 10 }).notNull(),
    cnrICreden: int("cnr_i_creden"),
    cnrIiCreden: int("cnr_ii_creden"),
    cnrIiiCreden: int("cnr_iii_creden"),
    cnrIInformado: int("cnr_i_informado"),
    cnrIiInformado: int("cnr_ii_informado"),
    cnrIiiInformado: int("cnr_iii_informado"),
    cnrIPago: int("cnr_i_pago"),
    cnrIiPago: int("cnr_ii_pago"),
    cnrIiiPago: int("cnr_iii_pago"),
    microscopistaCred: int("microscopista_cred"),
    microscopistaInformados: int("microscopista_informados"),
    microscopistaPago: int("microscopista_pago"),
    uomCred: int("uom_cred"),
    uomInformado: int("uom_informado"),
    uomPago: int("uom_pago"),
    ubsfCred: int("ubsf_cred"),
    ubsfsbCred: int("ubsfsb_cred"),
    ubsfComEsffInformado: int("ubsf_com_esff_informado"),
    ubsfComEsffsbInformado: int("ubsf_com_esffsb_informado"),
    ubsfComEsffMmInformado: int("ubsf_com_esff_mm_informado"),
    ubsfComEsffsbMmInformado: int("ubsf_com_esffsb_mm_informado"),
    ubsfPago: int("ubsf_pago"),
    gestaoCred: varchar("gestao_cred", { length: 50 }),
    eabpCred: int("eabp_cred"),
    eabpInformado: int("eabp_informado"),
    eabpPago: int("eabp_pago"),
  },
  (table) => [
    index("idx_rhp_out_mun").on(table.municipioIbge),
    index("idx_rhp_out_fin").on(table.competenciaFinanceira),
    foreignKey({
      name: "fk_rhp_out_mun",
      columns: [table.municipioIbge],
      foreignColumns: [municipios.codigoIbge],
    }),
  ]
);

// ==========================================
// 8. PROGRAMAS, ADESÕES E HOMOLOGAÇÕES
// ==========================================

export const pseAdesaoEscolas = mysqlTable(
  "pse_adesao_escolas",
  {
    id: serial("id").primaryKey(),
    escolaInep: varchar("escola_inep", { length: 20 }).notNull(),
    ciclo: varchar("ciclo", { length: 20 }).notNull(),
    quantidadeEducandos: int("quantidade_educandos").default(0),
    quantidadeCreche: int("quantidade_creche").default(0),
    quantidadePreEscola: int("quantidade_pre_escola").default(0),
    quantidadeFundamental: int("quantidade_fundamental").default(0),
    quantidadeMedio: int("quantidade_medio").default(0),
    quantidadeProfissional: int("quantidade_profissional").default(0),
    quantidadeEja: int("quantidade_eja").default(0),
    situacaoAdesao: varchar("situacao_adesao", { length: 50 }),
    parteDoGrupoPrioritario: boolean("parte_do_grupo_prioritario").default(false),
    possuiMaisDe50DosEducandosNoBfa: boolean("possui_mais_de_50_dos_educandos_no_bfa").default(false),
    participaDoSistemaNacionalMedidasSocioeducativas: boolean("part_sis_nac_acomp_medidas_socioeducativas").default(false),
    participouDoNutrisus: boolean("participou_do_nutrisus").default(false),
    aderiuAoProgramaDeObesidade: boolean("aderiu_ao_programa_de_obesidade").default(false),
  },
  (table) => [
    index("idx_pse_ad_esc").on(table.escolaInep),
    index("idx_pse_ad_ciclo").on(table.ciclo),
    foreignKey({
      name: "fk_pse_ad_esc",
      columns: [table.escolaInep],
      foreignColumns: [escolasPse.codigoInep],
    }),
  ]
);

export const agentesSaudeHomologados = mysqlTable(
  "agentes_saude_homologados",
  {
    id: serial("id").primaryKey(),
    municipioIbge: varchar("municipio_ibge", { length: 7 }).notNull(),
    nomeDoAgente: varchar("nome_do_agente", { length: 255 }).notNull(),
    curso: varchar("curso", { length: 255 }),
    vinculo: varchar("vinculo", { length: 50 }),
    dataDeFinalizacao: varchar("data_de_finalizacao", { length: 50 }),
  },
  (table) => [
    index("idx_ag_hom_mun").on(table.municipioIbge),
    foreignKey({
      name: "fk_ag_hom_mun",
      columns: [table.municipioIbge],
      foreignColumns: [municipios.codigoIbge],
    }),
  ]
);

export const sisabValidacoes = mysqlTable("sisab_validacoes", {
  id: serial("id").primaryKey(),
  validacao: varchar("validacao", { length: 255 }).notNull(),
  total: int("total").notNull(),
});

export const painelIndicadoresAps = mysqlTable("painel_indicadores_aps", {
  id: serial("id").primaryKey(),
  periodo: varchar("periodo", { length: 50 }),
  preNatal6Consultas: decimal("pre_natal_6_consultas", { precision: 5, scale: 2 }),
  preNatalSifilisEHiv: decimal("pre_natal_sifilis_e_hiv", { precision: 5, scale: 2 }),
  gestantesSaudeBucal: decimal("gestantes_saude_bucal", { precision: 5, scale: 2 }),
  coberturaCitopatologico: decimal("cobertura_citopatologico", { precision: 5, scale: 2 }),
  coberturaPolioEPenta: decimal("cobertura_polio_e_penta", { precision: 5, scale: 2 }),
  hipertensaoPaAferida: decimal("hipertensao_pa_aferida", { precision: 5, scale: 2 }),
  diabetesHemoglobinaGlicada: decimal("diabetes_hemoglobina_glicada", { precision: 5, scale: 2 }),
});

export const indicadoresCadastroAps = mysqlTable("indicadores_cadastro_aps", {
  id: serial("id").primaryKey(),
  competencia: varchar("competencia", { length: 50 }).notNull(),
  total: bigint("total", { mode: "number" }).notNull(),
});

export const producaoSaudeNacional = mysqlTable("producao_saude_nacional", {
  id: serial("id").primaryKey(),
  abrangencia: varchar("abrangencia", { length: 50 }).default("Brasil"),
  atendimentoIndividual: bigint("atendimento_individual", { mode: "number" }),
  atendimentoOdontologico: bigint("atendimento_odontologico", { mode: "number" }),
  procedimento: bigint("procedimento", { mode: "number" }),
  visitaDomiciliar: bigint("visita_domiciliar", { mode: "number" }),
});

export const indicadoresPrenatalAps = mysqlTable("indicadores_prenatal_aps", {
  id: serial("id").primaryKey(),
  competencia: varchar("competencia", { length: 20 }).notNull(),
  totalGestantes: int("total_gestantes").notNull(),
});

export const producaoAtividadeColetiva = mysqlTable("producao_atividade_coletiva", {
  id: serial("id").primaryKey(),
  abrangencia: varchar("abrangencia", { length: 50 }).default("Brasil"),
  quantidadeAtividade: int("quantidade_atividade"),
  numParticipantes: int("num_participantes"),
});

// ==========================================
// 9. PROGRAMAS DESCONTINUADOS E HISTÓRICOS
// ==========================================

export const informatizaApsHomologacoes = mysqlTable(
  "informatiza_aps_homologacoes",
  {
    id: serial("id").primaryKey(),
    codigoIne: varchar("codigo_ine", { length: 20 }).notNull(),
    municipioIbge: varchar("municipio_ibge", { length: 7 }).notNull(),
    situacao: varchar("situacao", { length: 255 }),
    portariaDeHomologacao: varchar("portaria_de_homologacao", { length: 255 }),
    portariaDeCancelamento: varchar("portaria_de_cancelamento", { length: 255 }),
  },
  (table) => [
    index("idx_inf_aps_ine").on(table.codigoIne),
    index("idx_inf_aps_mun").on(table.municipioIbge),
    foreignKey({
      name: "fk_inf_aps_ine",
      columns: [table.codigoIne],
      foreignColumns: [equipesSaude.codigoIne],
    }),
    foreignKey({
      name: "fk_inf_aps_mun",
      columns: [table.municipioIbge],
      foreignColumns: [municipios.codigoIbge],
    }),
  ]
);

export const saudeNaHoraAdesoes = mysqlTable(
  "saude_na_hora_adesoes",
  {
    id: serial("id").primaryKey(),
    codigoCnes: varchar("codigo_cnes", { length: 20 }).notNull(),
    municipioIbge: varchar("municipio_ibge", { length: 7 }).notNull(),
    tipoDaAdesao: varchar("tipo_da_adesao", { length: 100 }),
    situacaoDaAdesao: varchar("situacao_da_adesao", { length: 100 }),
    portariaDeAdesao: varchar("portaria_de_adesao", { length: 255 }),
    portariaDeCancelamento: varchar("portaria_de_cancelamento", { length: 255 }),
  },
  (table) => [
    index("idx_snh_cnes").on(table.codigoCnes),
    index("idx_snh_mun").on(table.municipioIbge),
    foreignKey({
      name: "fk_snh_cnes",
      columns: [table.codigoCnes],
      foreignColumns: [estabelecimentosSaude.codigoCnes],
    }),
    foreignKey({
      name: "fk_snh_mun",
      columns: [table.municipioIbge],
      foreignColumns: [municipios.codigoIbge],
    }),
  ]
);

export const relPagamentosPmaq = mysqlTable(
  "rel_pagamentos_pmaq",
  {
    id: serial("id").primaryKey(),
    municipioIbge: varchar("municipio_ibge", { length: 7 }).notNull(),
    competenciaCnes: varchar("competencia_cnes", { length: 10 }).notNull(),
    competenciaFinanceira: varchar("competencia_financeira", { length: 10 }).notNull(),
    qntEsf: int("qnt_esf"),
    qntEsb: int("qnt_esb"),
    qntNasf: int("qnt_nasf"),
    valorEsf: decimal("valor_esf", { precision: 15, scale: 2 }),
    valorEsb: decimal("valor_esb", { precision: 15, scale: 2 }),
    valorNasf: decimal("valor_nasf", { precision: 15, scale: 2 }),
    subtotal: decimal("subtotal", { precision: 15, scale: 2 }),
    desconto: decimal("desconto", { precision: 15, scale: 2 }),
    total: decimal("total", { precision: 15, scale: 2 }),
  },
  (table) => [
    index("idx_pmaq_mun").on(table.municipioIbge),
    index("idx_pmaq_comp_cnes").on(table.competenciaCnes),
    index("idx_pmaq_comp_fin").on(table.competenciaFinanceira),
    foreignKey({
      name: "fk_pmaq_mun",
      columns: [table.municipioIbge],
      foreignColumns: [municipios.codigoIbge],
    }),
  ]
);

// ==========================================
// 10. SIAPS (SISTEMA DE INFORMAÇÃO DA ATENÇÃO PRIMÁRIA)
// ==========================================

export const siapsAvaliacoesEquipes = mysqlTable(
  "siaps_avaliacoes_equipes",
  {
    id: serial("id").primaryKey(),
    quadrimestreAno: varchar("quadrimestre_ano", { length: 20 }).notNull(),
    municipioIbge: varchar("municipio_ibge", { length: 7 }).notNull(),
    tipoDeEquipe: varchar("tipo_de_equipe", { length: 50 }),
    dimensaoPorTipoDeEquipe: varchar("dimensao_por_tipo_de_equipe", { length: 150 }),
    totalDeEquipeRegular: int("total_de_equipe_regular").default(0),
    totalDeEquipeSuficiente: int("total_de_equipe_suficiente").default(0),
    totalDeEquipeBom: int("total_de_equipe_bom").default(0),
    totalDeEquipeOtimo: int("total_de_equipe_otimo").default(0),
  },
  (table) => [
    index("idx_siaps_mun").on(table.municipioIbge),
    index("idx_siaps_quad").on(table.quadrimestreAno),
    foreignKey({
      name: "fk_siaps_mun",
      columns: [table.municipioIbge],
      foreignColumns: [municipios.codigoIbge],
    }),
  ]
);

export const siapsPraticasDemografia = mysqlTable(
  "siaps_praticas_demografia",
  {
    id: serial("id").primaryKey(),
    categoria: varchar("categoria", { length: 100 }).notNull(),
    abrangencia: varchar("abrangencia", { length: 50 }).default("Brasil"),
    masculino: bigint("masculino", { mode: "number" }),
    feminino: bigint("feminino", { mode: "number" }),
    total: bigint("total", { mode: "number" }),
  },
  (table) => [
    index("idx_siaps_dem_cat").on(table.categoria),
  ]
);

export const siapsPraticasPorTipoEquipe = mysqlTable(
  "siaps_praticas_por_tipo_equipe",
  {
    id: serial("id").primaryKey(),
    abrangencia: varchar("abrangencia", { length: 50 }).default("Brasil"),
    semInformacao: int("sem_informacao"),
    esfEquipeDeSaudeDaFamilia: int("esf_equipe_de_saude_da_familia"),
    esfsbM1EsfComSaudeBucalMI: int("esfsb_m1_esf_com_saude_bucal_m_i"),
    esfsbM2EsfComSaudeBucalMII: int("esfsb_m2_esf_com_saude_bucal_m_ii"),
    eacsEquipeDeAgentesComunitariosDeSaude: int("eacs_equipe_de_agentes_comunitarios_de_saude"),
    nasf1NucleoDeApoioASaudeDaFamiliaNasfModalidade1: int("nasf1_nucleo_de_apoio_a_saude_da_familia_nasf_modalidade_1"),
    nasf2NucleoDeApoioASaudeDaFamiliaNasfModalidade2: int("nasf2_nucleo_de_apoio_a_saude_da_familia_nasf_modalidade_2"),
    eacssbM1EqAgentesComunitariosComSaudeBucalMi: int("eacssb_m1_eq_agentes_comunitarios_com_saude_bucal_mi"),
    eacssbM2EqAgentesComunitariosComSaudeBucalMii: int("eacssb_m2_eq_agentes_comunitarios_com_saude_bucal_mii"),
    esfrsbMiEsfRibeirinhaComSaudeBucalMi: int("esfrsb_mi_esf_ribeirinha_com_saude_bucal_mi"),
    eab1EquipeDeAtencaoBasicaTipoI: int("eab1_equipe_de_atencao_basica_tipo_i"),
    eab1sbEquipeDeAtencaoBasicaTipoIComSaudeBucal: int("eab1sb_equipe_de_atencao_basica_tipo_i_com_saude_bucal"),
    esf1EstrategiaDeSaudeDaFamiliaTipoI: int("esf1_estrategia_de_saude_da_familia_tipo_i"),
    esf1sbM1EsfTipoIComSaudeBucalModalidadeI: int("esf1sb_m1_esf_tipo_i_com_saude_bucal_modalidade_i"),
    esf4EstrategiaDeSaudeDaFamiliaTipoIv: int("esf4_estrategia_de_saude_da_familia_tipo_iv"),
    esf4sbM1EsfTipoIvComSaudeBucalModalidadeI: int("esf4sb_m1_esf_tipo_iv_com_saude_bucal_modalidade_i"),
    esf4sbM2EsfTipoIvComSaudeBucalModalidadeIi: int("esf4sb_m2_esf_tipo_iv_com_saude_bucal_modalidade_ii"),
    esftransEsfTransitoria: int("esftrans_esf_transitoria"),
    esftranssbM1EsfTransitoriaComSaudeBucalMi: int("esftranssb_m1_esf_transitoria_com_saude_bucal_mi"),
    esftranssbM2EsfTransitoriaComSaudeBucalMii: int("esftranssb_m2_esf_transitoria_com_saude_bucal_mii"),
    ecrMiiEquipeDosConsultoriosNaRuaModalidadeIi: int("ecr_mii_equipe_dos_consultorios_na_rua_modalidade_ii"),
    nasf3NucleoDeApoioASaudeDaFamiliaNasfModalidade3: int("nasf3_nucleo_de_apoio_a_saude_da_familia_nasf_modalidade_3"),
    total: int("total"),
  }
);
