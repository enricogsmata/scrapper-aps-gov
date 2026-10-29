// src/pipeline_silver/transformers/seed_municipios.ts
import { sql } from "drizzle-orm";
import { db } from "../../database/db/connection.js";
import { municipios } from "../../database/db/schema.js";
import { new_logger } from "../../services/logs.js";

const logger = new_logger(import.meta.url);

interface IbgeMunicipioResponse {
  id: number;
  nome: string;
  microrregiao?: {
    id: number;
    nome: string;
    mesorregiao?: {
      id: number;
      nome: string;
      UF?: {
        id: number;
        sigla: string;
        nome: string;
        regiao?: {
          id: number;
          sigla: string;
          nome: string;
        };
      };
    };
  } | null;
  "regiao-imediata"?: {
    id: number;
    nome: string;
    "regiao-intermediaria"?: {
      id: number;
      nome: string;
      UF?: {
        id: number;
        sigla: string;
        nome: string;
        regiao?: {
          id: number;
          sigla: string;
          nome: string;
        };
      };
    };
  } | null;
}

export async function seedMunicipios(): Promise<void> {
  const log = logger.forMethod("seedMunicipios");

  try {
    log.info({ data: [] }, "Iniciando busca de municípios na API do IBGE");

    const response = await fetch("https://servicodados.ibge.gov.br/api/v1/localidades/municipios");

    if (!response.ok) {
      throw new Error(`Erro na API do IBGE: ${response.statusText}`);
    }

    const data: IbgeMunicipioResponse[] = await response.json();

    const values = data.map((municipio) => {
      const codigoIbgeStr = municipio.id.toString();
      const ufSigla =
        municipio.microrregiao?.mesorregiao?.UF?.sigla ??
        municipio["regiao-imediata"]?.["regiao-intermediaria"]?.UF?.sigla ??
        "";

      return {
        codigoIbge: codigoIbgeStr,
        codigoIbge6: codigoIbgeStr.substring(0, 6),
        nome: municipio.nome,
        ufSigla,
        codigoMicrorregiao: municipio.microrregiao?.id ? municipio.microrregiao.id.toString() : null,
      };
    });

    log.info({ data: [{ totalExtraido: values.length }] }, "Dados recebidos, iniciando UPSERT no banco normalizado");

    if (values.length > 0) {
      const chunkSize = 1000;
      for (let i = 0; i < values.length; i += chunkSize) {
        const chunk = values.slice(i, i + chunkSize);

        await db.insert(municipios)
          .values(chunk)
          .onDuplicateKeyUpdate({
            set: {
              codigoIbge6: sql`VALUES(codigo_ibge_6)`,
              nome: sql`VALUES(nome)`,
              ufSigla: sql`VALUES(uf_sigla)`,
              codigoMicrorregiao: sql`VALUES(codigo_microrregiao)`,
            },
          });
      }
    }

    log.info({ data: [{ totalSincronizado: values.length }] }, "Seed de municípios concluído com sucesso");
  } catch (error) {
    log.error({ data: [error] }, "Erro durante a execução do seed de municípios");
    throw error;
  }
}