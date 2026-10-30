// src/pipeline_silver/transformers/acoes_e_programas_adesao_pse.ts
import { sql } from "drizzle-orm";
import { db } from "../../database/db/connection.js";
import { raw_db } from "../../database/raw_db/connection.js";
import {
  municipios,
  escolasPse,
  pseAdesaoEscolas
} from "../../database/db/schema.js";
import { acoesEProgramasAdesaoPse } from "../../database/raw_db/schema.js";
import { new_logger } from "../../services/logs.js";

const logger = new_logger(import.meta.url);

function parseIntSafe(val: string | null): number {
  if (!val) return 0;
  const parsed = parseInt(val.replace(/\D/g, ""), 10);
  return isNaN(parsed) ? 0 : parsed;
}

function parseBooleanSafe(val: string | null): boolean {
  if (!val) return false;
  const normalized = val.trim().toLowerCase();
  return normalized === "sim" || normalized === "1" || normalized === "true" || normalized === "s";
}

export async function transformAcoesEProgramasAdesaoPse(): Promise<void> {
  const log = logger.forMethod("transformAcoesEProgramasAdesaoPse");

  try {
    log.info({ data: [] }, "Iniciando extração de acoes_e_programas_adesao_pse do raw_db");

    const rawData = await raw_db.select().from(acoesEProgramasAdesaoPse);

    log.info({ data: [{ totalExtraido: rawData.length }] }, "Dados extraídos. Iniciando processamento e normalização");

    if (rawData.length === 0) {
      log.info({ data: [] }, "Nenhum dado para processar.");
      return;
    }

    const uniqueMunicipiosMap = new Map<string, any>();
    const uniqueEscolasMap = new Map<string, any>();
    const fatosToInsert: any[] = [];

    for (const row of rawData) {
      if (!row.ibge || !row.inep) continue;

      // 1. Municípios (Complemento SUS)
      if (!uniqueMunicipiosMap.has(row.ibge)) {
        uniqueMunicipiosMap.set(row.ibge, {
          codigoIbge: row.ibge,
          codigoIbge6: row.ibge.substring(0, 6),
          nome: row.municipio || "Não informado",
          ufSigla: row.uf || "NI",
        });
      }

      // 2. Escolas PSE
      if (!uniqueEscolasMap.has(row.inep)) {
        uniqueEscolasMap.set(row.inep, {
          codigoInep: row.inep,
          nomeEscola: row.nomeDaEscola || "Não informado",
          municipioIbge: row.ibge,
          tipoLocalizacao: row.tipoDeLocalizacao,
          localizacaoDiferenciada: row.localizacaoDiferenciada,
          esferaAdministrativa: row.esferaAdministrativa,
        });
      }

      // 3. Fato: PSE Adesão Escolas
      fatosToInsert.push({
        escolaInep: row.inep,
        ciclo: row.ciclo || "NI",
        quantidadeEducandos: parseIntSafe(row.quantidadeEducandos),
        quantidadeCreche: parseIntSafe(row.quantidadeCreche),
        quantidadePreEscola: parseIntSafe(row.quantidadePreEscola),
        quantidadeFundamental: parseIntSafe(row.quantidadeFundamental),
        quantidadeMedio: parseIntSafe(row.quantidadeMedio),
        quantidadeProfissional: parseIntSafe(row.quantidadeProfissional),
        quantidadeEja: parseIntSafe(row.quantidadeEja),
        situacaoAdesao: row.situacaoAdesao,
        parteDoGrupoPrioritario: parseBooleanSafe(row.parteDoGrupoPrioritario),
        possuiMaisDe50DosEducandosNoBfa: parseBooleanSafe(row.possuiMaisDe50DosEducandosNoBfa),
        participaDoSistemaNacionalMedidasSocioeducativas: parseBooleanSafe(row.participaDoSistemaNacionalDeAcompanhamentoDeMedidasSocioeducativas),
        participouDoNutrisus: parseBooleanSafe(row.participouDoNutrisus),
        aderiuAoProgramaDeObesidade: parseBooleanSafe(row.aderiuAoProgramaDeObesidade),
        data: row.data,
      });
    }

    const municipiosValues = Array.from(uniqueMunicipiosMap.values());
    const escolasValues = Array.from(uniqueEscolasMap.values());

    log.info({
      data: [{
        municipios: municipiosValues.length,
        escolas: escolasValues.length,
        fatos: fatosToInsert.length,
      }]
    }, "Iniciando UPSERTs nas tabelas dimensionais e inserção na tabela fato");

    const chunkSize = 1000;

    // UPSERT Municípios
    if (municipiosValues.length > 0) {
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
    }

    // UPSERT Escolas PSE
    if (escolasValues.length > 0) {
      for (let i = 0; i < escolasValues.length; i += chunkSize) {
        await db.insert(escolasPse)
          .values(escolasValues.slice(i, i + chunkSize))
          .onDuplicateKeyUpdate({
            set: {
              nomeEscola: sql`VALUES(nome_escola)`,
              municipioIbge: sql`VALUES(municipio_ibge)`,
              tipoLocalizacao: sql`VALUES(tipo_localizacao)`,
              localizacaoDiferenciada: sql`VALUES(localizacao_diferenciada)`,
              esferaAdministrativa: sql`VALUES(esfera_administrativa)`,
            },
          });
      }
    }

    // CLEAN & INSERT Fatos (Garantir idempotência na tabela fato)
    await db.delete(pseAdesaoEscolas);

    if (fatosToInsert.length > 0) {
      for (let i = 0; i < fatosToInsert.length; i += chunkSize) {
        await db.insert(pseAdesaoEscolas)
          .values(fatosToInsert.slice(i, i + chunkSize));
      }
    }

    log.info({ data: [] }, "Transformação e carga de acoes_e_programas_adesao_pse concluídas com sucesso");
  } catch (error) {
    log.error({ data: [error] }, "Erro durante a transformação de acoes_e_programas_adesao_pse");
    throw error;
  }
}