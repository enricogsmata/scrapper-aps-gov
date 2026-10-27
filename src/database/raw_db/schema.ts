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
});