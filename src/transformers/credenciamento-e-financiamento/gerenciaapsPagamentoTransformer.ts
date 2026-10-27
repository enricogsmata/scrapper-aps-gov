// src/transformers/credenciamento-e-financiamento/gerenciaapsPagamentoTransformer.ts
import fs from "node:fs/promises";
import path from "node:path";
import xlsx from "xlsx";
import pino from "pino";
import { raw_db } from "../../database/raw_db/connection.js";
import { gerenciaapsPagamento } from "../../database/raw_db/schema.js";

const logger = pino();

interface PlanoOrcamentario {
  coSeqPlanoOrcamentario?: unknown;
  dsPlanoOrcamentario?: unknown;
  dsGestao?: unknown;
  vlTotalCusteio?: unknown;
  vlTotalImplantacao?: unknown;
}

interface Agrupamento {
  coUfIbge?: unknown;
  sgUf?: unknown;
  coMunicipioIbge?: unknown;
  noMunicipio?: unknown;
  nuCompCnes?: unknown;
  nuParcela?: unknown;
  coProcesso?: unknown;
  total?: unknown;
  listaPagamentoPlanoOrcamentario?: PlanoOrcamentario[];
}

interface JsonPayload {
  data?: unknown;
  agrupamentos?: Agrupamento[];
}

interface XlsRow {
  UF?: unknown;
  MUNICÍPIO?: unknown;
  IBGE?: unknown;
  "Comp. CNES"?: unknown;
  Parcela?: unknown;
  "Plano Orcamentário"?: unknown;
  Gestão?: unknown;
  "Valor Integral"?: unknown;
  Ajuste?: unknown;
  Desconto?: unknown;
  "Valor efetivo de repasse"?: unknown;
  "Valor da Implantação"?: unknown;
  "Ajuste da Implantação"?: unknown;
  "Desconto da Implantação"?: unknown;
  "Valor total da implantação"?: unknown;
}

export async function transformGerenciaapsPagamento(): Promise<void> {
  const dirPath = path.resolve(
    process.cwd(),
    "downloads",
    "credenciamento-e-financiamento",
    "gerenciaaps-pagamento"
  );

  let files: string[];
  try {
    files = await fs.readdir(dirPath);
  } catch (error) {
    logger.error({ error, dirPath }, "Diretório não encontrado ou inacessível.");
    return;
  }

  const jsonFiles = files.filter((file) => file.endsWith(".json"));
  const xlsFiles = files.filter(
    (file) => file.endsWith(".xls") || file.endsWith(".xlsx")
  );

  for (const file of jsonFiles) {
    const filePath = path.join(dirPath, file);
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const parsed: JsonPayload = JSON.parse(content);

      const records: (typeof gerenciaapsPagamento.$inferInsert)[] = [];
      const dataStr = parsed.data != null ? String(parsed.data).trim() : "";

      if (Array.isArray(parsed.agrupamentos)) {
        for (const agrupamento of parsed.agrupamentos) {
          const coUfIbge = agrupamento.coUfIbge != null ? String(agrupamento.coUfIbge).trim() : "";
          const sgUf = agrupamento.sgUf != null ? String(agrupamento.sgUf).trim() : "";
          const coMunicipioIbge = agrupamento.coMunicipioIbge != null ? String(agrupamento.coMunicipioIbge).trim() : "";
          const noMunicipio = agrupamento.noMunicipio != null ? String(agrupamento.noMunicipio).trim() : "";
          const nuCompCnes = agrupamento.nuCompCnes != null ? String(agrupamento.nuCompCnes).trim() : "";
          const nuParcela = agrupamento.nuParcela != null ? String(agrupamento.nuParcela).trim() : "";
          const coProcesso = agrupamento.coProcesso != null ? String(agrupamento.coProcesso).trim() : "";
          const total = agrupamento.total != null ? String(agrupamento.total).trim() : "";

          const itens = agrupamento.listaPagamentoPlanoOrcamentario;
          if (Array.isArray(itens) && itens.length > 0) {
            for (const item of itens) {
              records.push({
                data: dataStr,
                coUfIbge,
                sgUf,
                coMunicipioIbge,
                noMunicipio,
                nuCompCnes,
                nuParcela,
                coProcesso,
                total,
                coSeqPlanoOrcamentario: item.coSeqPlanoOrcamentario != null ? String(item.coSeqPlanoOrcamentario).trim() : "",
                dsPlanoOrcamentario: item.dsPlanoOrcamentario != null ? String(item.dsPlanoOrcamentario).trim() : "",
                dsGestao: item.dsGestao != null ? String(item.dsGestao).trim() : "",
                vlTotalCusteio: item.vlTotalCusteio != null ? String(item.vlTotalCusteio).trim() : "",
                vlTotalImplantacao: item.vlTotalImplantacao != null ? String(item.vlTotalImplantacao).trim() : "",
                valorIntegral: "",
                ajuste: "",
                desconto: "",
                valorEfetivoRepasse: "",
                valorImplantacao: "",
                ajusteImplantacao: "",
                descontoImplantacao: "",
              });
            }
          } else {
            records.push({
              data: dataStr,
              coUfIbge,
              sgUf,
              coMunicipioIbge,
              noMunicipio,
              nuCompCnes,
              nuParcela,
              coProcesso,
              total,
              coSeqPlanoOrcamentario: "",
              dsPlanoOrcamentario: "",
              dsGestao: "",
              vlTotalCusteio: "",
              vlTotalImplantacao: "",
              valorIntegral: "",
              ajuste: "",
              desconto: "",
              valorEfetivoRepasse: "",
              valorImplantacao: "",
              ajusteImplantacao: "",
              descontoImplantacao: "",
            });
          }
        }
      }

      if (records.length === 0) continue;

      const batchSize = 1000;
      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        await raw_db.insert(gerenciaapsPagamento).values(batch);
      }

      logger.info({ file, count: records.length }, "Arquivo JSON processado com sucesso.");
    } catch (error) {
      logger.error({ error, file }, "Erro ao processar arquivo JSON.");
    }
  }

  for (const file of xlsFiles) {
    const filePath = path.join(dirPath, file);
    try {
      const workbook = xlsx.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) continue;

      const worksheet = workbook.Sheets[sheetName];
      const rows = xlsx.utils.sheet_to_json<XlsRow>(worksheet, { defval: "" });

      if (rows.length === 0) continue;

      const records: (typeof gerenciaapsPagamento.$inferInsert)[] = rows.map((row) => ({
        data: "",
        coUfIbge: "",
        sgUf: String(row.UF ?? "").trim(),
        coMunicipioIbge: String(row.IBGE ?? "").trim(),
        noMunicipio: String(row.MUNICÍPIO ?? "").trim(),
        nuCompCnes: String(row["Comp. CNES"] ?? "").trim(),
        nuParcela: String(row.Parcela ?? "").trim(),
        coProcesso: "",
        total: "",
        coSeqPlanoOrcamentario: "",
        dsPlanoOrcamentario: String(row["Plano Orcamentário"] ?? "").trim(),
        dsGestao: String(row.Gestão ?? "").trim(),
        vlTotalCusteio: "",
        vlTotalImplantacao: String(row["Valor total da implantação"] ?? "").trim(),
        valorIntegral: String(row["Valor Integral"] ?? "").trim(),
        ajuste: String(row.Ajuste ?? "").trim(),
        desconto: String(row.Desconto ?? "").trim(),
        valorEfetivoRepasse: String(row["Valor efetivo de repasse"] ?? "").trim(),
        valorImplantacao: String(row["Valor da Implantação"] ?? "").trim(),
        ajusteImplantacao: String(row["Ajuste da Implantação"] ?? "").trim(),
        descontoImplantacao: String(row["Desconto da Implantação"] ?? "").trim(),
      }));

      const batchSize = 1000;
      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        await raw_db.insert(gerenciaapsPagamento).values(batch);
      }

      logger.info({ file, count: records.length }, "Arquivo XLS/XLSX processado com sucesso.");
    } catch (error) {
      logger.error({ error, file }, "Erro ao processar arquivo XLS/XLSX.");
    }
  }
}