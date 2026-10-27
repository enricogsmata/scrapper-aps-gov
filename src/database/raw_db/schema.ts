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