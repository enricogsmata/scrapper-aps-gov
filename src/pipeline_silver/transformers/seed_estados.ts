// src\pipeline_silver\transformers\seed_estados.ts
import { sql } from "drizzle-orm";
import { db } from "../../database/db/connection.js";
import { estados } from "../../database/db/schema.js";
import { new_logger } from "../../services/logs.js";

const logger = new_logger(import.meta.url);
const log = logger.forMethod("seedEstados");

interface IbgeEstadoResponse {
  id: number;
  sigla: string;
  nome: string;
  regiao: {
    id: number;
    sigla: string;
    nome: string;
  };
}

export async function seedEstados(): Promise<void> {
  try {
    log.info({ data: [] }, "Iniciando busca de estados na API do IBGE");

    const response = await fetch("https://servicodados.ibge.gov.br/api/v1/localidades/estados");
    
    if (!response.ok) {
      throw new Error(`Erro na API do IBGE: ${response.statusText}`);
    }

    const data: IbgeEstadoResponse[] = await response.json();

    const values = data.map((estado) => ({
      sigla: estado.sigla,
      codigoIbge: estado.id.toString(),
      nome: estado.nome,
      regiao: estado.regiao.nome,
    }));

    log.info({ data: [{ totalExtraido: values.length }] }, "Dados recebidos, iniciando UPSERT no banco normalizado");

    if (values.length > 0) {
      await db.insert(estados)
        .values(values)
        .onDuplicateKeyUpdate({
          set: {
            codigoIbge: sql`VALUES(codigo_ibge)`,
            nome: sql`VALUES(nome)`,
            regiao: sql`VALUES(regiao)`,
          },
        });
    }

    log.info({ data: [{ totalSincronizado: values.length }] }, "Seed de estados concluído com sucesso");
  } catch (error) {
    log.error({ data: [error] }, "Erro durante a execução do seed de estados");
    throw error;
  }
}