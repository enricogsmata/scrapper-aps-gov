// src/transformers/credenciamento-e-financiamento/gerenciaapsPagamentoHistoricoTransformer.ts
import fs from "node:fs/promises";
import path from "node:path";
import xlsx from "xlsx";
import pino from "pino";
import { raw_db } from "../../database/raw_db/connection.js";
import { gerenciaapsPagamentoHistorico } from "../../database/raw_db/schema.js";

const logger = pino();

export async function transformGerenciaapsPagamentoHistorico(): Promise<void> {
  const dirPath = path.resolve(
    process.cwd(),
    "downloads",
    "credenciamento-e-financiamento",
    "gerenciaaps-pagamento",
    "historico"
  );

  let files: string[];
  try {
    files = await fs.readdir(dirPath);
  } catch (error) {
    logger.error({ error, dirPath }, "Diretório não encontrado ou inacessível.");
    return;
  }

  const xlsFiles = files.filter(
    (file) => file.endsWith(".xls") || file.endsWith(".xlsx")
  );

  for (const file of xlsFiles) {
    const filePath = path.join(dirPath, file);
    try {
      const workbook = xlsx.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) continue;

      const worksheet = workbook.Sheets[sheetName];
      const rawRows = xlsx.utils.sheet_to_json<unknown[]>(worksheet, {
        header: 1,
        defval: "",
      });

      const records: (typeof gerenciaapsPagamentoHistorico.$inferInsert)[] = [];

      for (let i = 5; i < rawRows.length; i++) {
        const row = rawRows[i];
        if (!Array.isArray(row) || row.length === 0) continue;

        const uf = String(row[1] ?? "").trim();
        const ibge = String(row[3] ?? "").trim();
        if (!uf && !ibge) continue;

        records.push({
          uf,
          municipio: String(row[2] ?? "").trim(),
          ibge,
          compCnes: String(row[4] ?? "").trim(),
          parcela: String(row[5] ?? "").trim(),
          tipologia: String(row[6] ?? "").trim(),
          populacao: String(row[7] ?? "").trim(),
          credenciadasEsf: String(row[8] ?? "").trim(),
          credenciadasEap: String(row[9] ?? "").trim(),
          homologadasEsf: String(row[10] ?? "").trim(),
          homologadasEap: String(row[11] ?? "").trim(),
          pagasEsf: String(row[12] ?? "").trim(),
          pagasEap20h: String(row[13] ?? "").trim(),
          pagasEap30h: String(row[14] ?? "").trim(),
          calcCadastroEsfEap: String(row[15] ?? "").trim(),
          calcCadastroPotencial: String(row[16] ?? "").trim(),
          calcQtdeEsfQuadrimestre: String(row[17] ?? "").trim(),
          calcQtdeEap20hQuadrimestre: String(row[18] ?? "").trim(),
          calcQtdeEap30hQuadrimestre: String(row[19] ?? "").trim(),
          calcQtdePopVulneravel: String(row[20] ?? "").trim(),
          calcQtdePopNaoVulneravel: String(row[21] ?? "").trim(),
          calcQtdeCadastroPagamento: String(row[22] ?? "").trim(),
          calcValorPontoVulneravel: String(row[23] ?? "").trim(),
          calcValorPontoNaoVulneravel: String(row[24] ?? "").trim(),
          calcValorPontoPorEquipe: String(row[25] ?? "").trim(),
          calcValorPagamentoPorEquipeQuadrimestre: String(row[26] ?? "").trim(),
          compEsfCompletas: String(row[27] ?? "").trim(),
          compEsfIncompletas75: String(row[28] ?? "").trim(),
          compEsfIncompletas50: String(row[29] ?? "").trim(),
          compEsfIncompletas25: String(row[30] ?? "").trim(),
          compEap20hCompletas: String(row[31] ?? "").trim(),
          compEap20hIncompletas: String(row[32] ?? "").trim(),
          compEap30hCompletas: String(row[33] ?? "").trim(),
          compEap30hIncompletas: String(row[34] ?? "").trim(),
          compValorTotalPagamento: String(row[35] ?? "").trim(),
          novasEsfCompletas: String(row[36] ?? "").trim(),
          novasEsfIncompletas75: String(row[37] ?? "").trim(),
          novasEsfIncompletas50: String(row[38] ?? "").trim(),
          novasEsfIncompletas25: String(row[39] ?? "").trim(),
          novasEap20hCompletas: String(row[40] ?? "").trim(),
          novasEap20hIncompletas: String(row[41] ?? "").trim(),
          novasEap30hCompletas: String(row[42] ?? "").trim(),
          novasEap30hIncompletas: String(row[43] ?? "").trim(),
          novasCadastroPotencial: String(row[44] ?? "").trim(),
          novasValorPagamentoPorEquipe: String(row[45] ?? "").trim(),
          novasValorTotalPagamento: String(row[46] ?? "").trim(),
          especificasQtdeEcr: String(row[47] ?? "").trim(),
          especificasCadastroEcr: String(row[48] ?? "").trim(),
          especificasValorPontoEcr: String(row[49] ?? "").trim(),
          especificasValorPagamentoEcr: String(row[50] ?? "").trim(),
          especificasQtdeEapp: String(row[51] ?? "").trim(),
          especificasCadastroEapp: String(row[52] ?? "").trim(),
          especificasValorPontoEapp: String(row[53] ?? "").trim(),
          especificasValorPagamentoEapp: String(row[54] ?? "").trim(),
          especificasQtdeEsfr: String(row[55] ?? "").trim(),
          especificasCadastroVulneravelEsfr: String(row[56] ?? "").trim(),
          especificasCadastroNaoVulneravelEsfr: String(row[57] ?? "").trim(),
          especificasValorPontoVulneravelEsfrb: String(row[58] ?? "").trim(),
          especificasValorPontoNaoVulneravelEsfr: String(row[59] ?? "").trim(),
          especificasValorPagamentoVulneravelEsfr: String(row[60] ?? "").trim(),
          especificasValorPagamentoNaoVulneravelEsfr: String(row[61] ?? "").trim(),
          valorCapitacaoPonderada: String(row[62] ?? "").trim(),
          valorComplementacaoFinanceira: String(row[63] ?? "").trim(),
          ajusteAdicional: String(row[64] ?? "").trim(),
          ajusteDesconto: String(row[65] ?? "").trim(),
          valorTotal: String(row[66] ?? "").trim(),
        });
      }

      if (records.length === 0) continue;

      const batchSize = 1000;
      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        await raw_db.insert(gerenciaapsPagamentoHistorico).values(batch);
      }

      logger.info(
        { file, count: records.length },
        "Arquivo histórico processado com sucesso."
      );
    } catch (error) {
      logger.error({ error, file }, "Erro ao processar arquivo histórico.");
    }
  }
}