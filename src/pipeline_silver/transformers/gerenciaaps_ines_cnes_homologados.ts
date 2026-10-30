// src\pipeline_silver\transformers\gerenciaaps_ines_cnes_homologados.ts
import { sql } from "drizzle-orm";
import { db } from "../../database/db/connection.js";
import { raw_db } from "../../database/raw_db/connection.js";
import {
  municipios,
  tiposEquipe,
  equipesSaude,
  gerenciaapsEquipesHomologadas
} from "../../database/db/schema.js";
import { gerenciaapsInesCnesHomologados } from "../../database/raw_db/schema.js";
import { new_logger } from "../../services/logs.js";

const logger = new_logger(import.meta.url);

export async function transformGerenciaapsInesCnesHomologados(): Promise<void> {
  const log = logger.forMethod("transformGerenciaapsInesCnesHomologados");

  try {
    log.info({ data: [] }, "Iniciando extração de gerenciaaps_ines_cnes_homologados do raw_db");

    const rawData = await raw_db.select().from(gerenciaapsInesCnesHomologados);

    log.info({ data: [{ totalExtraido: rawData.length }] }, "Dados extraídos. Iniciando processamento e normalização");

    if (rawData.length === 0) {
      log.info({ data: [] }, "Nenhum dado para processar.");
      return;
    }

    const uniqueMunicipiosMap = new Map<string, any>();
    const uniqueTiposEquipeMap = new Map<string, any>();
    const uniqueEquipesSaudeMap = new Map<string, any>();
    const fatosToInsert: any[] = [];

    for (const row of rawData) {
      if (!row.ibge || !row.ine) continue;

      // 1. Municipios (Apenas dados básicos do SUS, IBGE master seed mantém o resto)
      if (!uniqueMunicipiosMap.has(row.ibge)) {
        uniqueMunicipiosMap.set(row.ibge, {
          codigoIbge: row.ibge,
          codigoIbge6: row.ibge.substring(0, 6),
          nome: row.municipio || "Não informado",
          ufSigla: row.uf || "NI",
        });
      }

      // 2. Tipos de Equipe
      const tipoEquipeCodigo = row.codigoDoTipoDeEquipe || "NI";
      if (!uniqueTiposEquipeMap.has(tipoEquipeCodigo)) {
        uniqueTiposEquipeMap.set(tipoEquipeCodigo, {
          codigo: tipoEquipeCodigo,
          nome: row.tipoDeEquipe || "Não informado",
          subtipo: row.subtipoDeEquipe,
        });
      }

      // 3. Equipes de Saúde
      if (!uniqueEquipesSaudeMap.has(row.ine)) {
        uniqueEquipesSaudeMap.set(row.ine, {
          codigoIne: row.ine,
          municipioIbge: row.ibge,
          tipoEquipeCodigo: tipoEquipeCodigo,
          esferaAdministrativa: row.esferaAdministrativa,
        });
      }

      // 4. Fato: Gerencia APS Equipes Homologadas
      fatosToInsert.push({
        codigoIne: row.ine,
        municipioIbge: row.ibge,
        tipoEquipeCodigo: tipoEquipeCodigo,
        portaria: row.portaria,
        esferaAdministrativa: row.esferaAdministrativa,
        codigoCnes: row.cnes,
        dominioUnidade: row.dominioUnidade,
      });
    }

    const municipiosValues = Array.from(uniqueMunicipiosMap.values());
    const tiposEquipeValues = Array.from(uniqueTiposEquipeMap.values());
    const equipesSaudeValues = Array.from(uniqueEquipesSaudeMap.values());

    log.info({
      data: [{
        municipios: municipiosValues.length,
        tiposEquipe: tiposEquipeValues.length,
        equipesSaude: equipesSaudeValues.length,
        fatos: fatosToInsert.length
      }]
    }, "Iniciando UPSERTs nas tabelas dimensionais e inserção na tabela fato");

    const chunkSize = 1000;

    // UPSERT Municipios
    for (let i = 0; i < municipiosValues.length; i += chunkSize) {
      await db.insert(municipios)
        .values(municipiosValues.slice(i, i + chunkSize))
        .onDuplicateKeyUpdate({
          set: {
            nome: sql`COALESCE(municipios.nome, VALUES(nome))`,
            ufSigla: sql`COALESCE(municipios.uf_sigla, VALUES(uf_sigla))`,
          },
        });
    }

    // UPSERT Tipos de Equipe
    for (let i = 0; i < tiposEquipeValues.length; i += chunkSize) {
      await db.insert(tiposEquipe)
        .values(tiposEquipeValues.slice(i, i + chunkSize))
        .onDuplicateKeyUpdate({
          set: {
            nome: sql`VALUES(nome)`,
            subtipo: sql`VALUES(subtipo)`,
          },
        });
    }

    // UPSERT Equipes de Saúde
    for (let i = 0; i < equipesSaudeValues.length; i += chunkSize) {
      await db.insert(equipesSaude)
        .values(equipesSaudeValues.slice(i, i + chunkSize))
        .onDuplicateKeyUpdate({
          set: {
            municipioIbge: sql`VALUES(municipio_ibge)`,
            tipoEquipeCodigo: sql`VALUES(tipo_equipe_codigo)`,
            esferaAdministrativa: sql`VALUES(esfera_administrativa)`,
          },
        });
    }

    // CLEAN & INSERT Fatos (Garantir idempotência na tabela fato)
    await db.delete(gerenciaapsEquipesHomologadas);

    for (let i = 0; i < fatosToInsert.length; i += chunkSize) {
      await db.insert(gerenciaapsEquipesHomologadas)
        .values(fatosToInsert.slice(i, i + chunkSize));
    }

    log.info({ data: [] }, "Transformação e carga de gerenciaaps_ines_cnes_homologados concluídas com sucesso");
  } catch (error) {
    log.error({ data: [error] }, "Erro durante a transformação de gerenciaaps_ines_cnes_homologados");
    throw error;
  }
}