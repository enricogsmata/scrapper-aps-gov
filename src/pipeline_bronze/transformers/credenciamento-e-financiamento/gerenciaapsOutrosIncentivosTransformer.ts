// src/transformers/credenciamento-e-financiamento/gerenciaapsOutrosIncentivosTransformer.ts
import fs from "node:fs/promises";
import path from "node:path";
import AdmZip from "adm-zip";
import xlsx from "xlsx";
import pino from "pino";
import { raw_db } from "../../../database/raw_db/connection.js";
import {
  gerenciaapsOutrosIncentivosPrt32632019,
  gerenciaapsOutrosIncentivosPrt3312022,
  gerenciaapsOutrosIncentivosPrt6502021,
  gerenciaapsOutrosIncentivosPrt20102021,
  gerenciaapsOutrosIncentivosPrt39782021,
} from "../../../database/raw_db/schema.js";

const logger = pino();

function normalizeKey(key: string): string {
  return key
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getVal(row: Record<string, unknown>, targetPattern: string): string {
  for (const [k, v] of Object.entries(row)) {
    if (normalizeKey(k).includes(normalizeKey(targetPattern))) {
      return v != null ? String(v).trim() : "";
    }
  }
  return "";
}

async function processWorkbook(
  workbook: xlsx.WorkBook,
  fileName: string,
  contextName: string
): Promise<void> {
  const normCtx = normalizeKey(`${contextName}_${fileName}`);

  let targetType: "3263" | "331" | "650" | "2010" | "3978" | null = null;
  if (normCtx.includes("3263") || normCtx.includes("cadastre")) {
    targetType = "3263";
  } else if (normCtx.includes("650")) {
    targetType = "650";
  } else if (normCtx.includes("2010")) {
    targetType = "2010";
  } else if (normCtx.includes("3978")) {
    targetType = "3978";
  } else if (normCtx.includes("331")) {
    targetType = "331";
  }

  for (const sheetName of workbook.SheetNames) {
    if (sheetName.toLowerCase().includes("dicionario")) continue;

    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) continue;

    const rawRows = xlsx.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      defval: "",
    });

    let headerIdx = -1;
    for (let i = 0; i < Math.min(rawRows.length, 15); i++) {
      const lineStr = (rawRows[i] ?? []).map((c) => String(c).trim()).join(" ");
      const normLine = normalizeKey(lineStr);
      if (normLine.includes("uf") && (normLine.includes("ibge") || normLine.includes("municipio"))) {
        headerIdx = i;
        break;
      }
    }

    if (headerIdx === -1) continue;

    const rows = xlsx.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
      range: headerIdx,
      defval: "",
    });

    if (rows.length === 0) continue;

    const batchSize = 1000;

    if (targetType === "3263") {
      const records = rows
        .filter((r) => getVal(r, "uf") || getVal(r, "ine") || getVal(r, "ibge"))
        .map((r) => ({
          uf: getVal(r, "uf"),
          ibge: getVal(r, "ibge"),
          municipio: getVal(r, "municipio"),
          ine: getVal(r, "ine"),
        }));

      for (let i = 0; i < records.length; i += batchSize) {
        await raw_db.insert(gerenciaapsOutrosIncentivosPrt32632019).values(records.slice(i, i + batchSize));
      }
    } else if (targetType === "650") {
      const records = rows
        .filter((r) => getVal(r, "uf") || getVal(r, "ibge") || getVal(r, "municipio"))
        .map((r) => ({
          uf: getVal(r, "uf"),
          municipio: getVal(r, "municipio"),
          ibge: getVal(r, "ibge"),
          compCnes: getVal(r, "comp"),
          cnesSolicitado: getVal(r, "cnes"),
          tipoDaUnidade: getVal(r, "tipo da unidade"),
          unidadeAtiva: getVal(r, "unidade ativa"),
          unidadeValida: getVal(r, "unidade valida"),
          classificacaoValidada: getVal(r, "classificacao validada"),
          qtdeDeMedicos: getVal(r, "qtde de medicos"),
          qtdeDeEnfermeiros: getVal(r, "qtde de enfermeiros"),
          qtdeDeTecnicoAuxiliarEnfermagem: getVal(r, "tecnico/ auxiliar") || getVal(r, "tecnico/auxiliar"),
          cargaHorariaDeMedicos: getVal(r, "carga horaria de medicos"),
          cargaHorariaDeEnfermeiros: getVal(r, "carga horaria de enfermeiros") || getVal(r, "carga horaria de enferemeiros"),
          cargaHorariaDeTecnicoAuxiliarEnfermagem: getVal(r, "carga horaria de tecnico"),
          cumpriuRequisitoCusteio: getVal(r, "cumpriu requisito"),
          contempladoPortaria650: getVal(r, "contemplado na portaria"),
        }));

      for (let i = 0; i < records.length; i += batchSize) {
        await raw_db.insert(gerenciaapsOutrosIncentivosPrt6502021).values(records.slice(i, i + batchSize));
      }
    } else if (targetType === "2010") {
      const records = rows
        .filter((r) => getVal(r, "uf") || getVal(r, "ibge") || getVal(r, "municipio"))
        .map((r) => ({
          uf: getVal(r, "uf"),
          municipio: getVal(r, "municipio"),
          ibge: getVal(r, "ibge"),
          compCnes: getVal(r, "comp"),
          cnesSolicitado: getVal(r, "cnes"),
          tipoDaUnidade: getVal(r, "tipo da unidade"),
          unidadeAtiva: getVal(r, "unidade ativa"),
          unidadeValida: getVal(r, "unidade valida"),
          classificacaoValidada: getVal(r, "classificacao validada"),
          qtdeDeMedicos: getVal(r, "qtde de medicos"),
          qtdeDeEnfermeiros: getVal(r, "qtde de enfermeiros"),
          qtdeDeTecnicoAuxiliarEnfermagem: getVal(r, "tecnico/ auxiliar") || getVal(r, "tecnico/auxiliar"),
          cargaHorariaDeMedicos: getVal(r, "carga horaria de medicos"),
          cargaHorariaDeEnfermeiros: getVal(r, "carga horaria de enfermeiros") || getVal(r, "carga horaria de enferemeiros"),
          cargaHorariaDeTecnicoAuxiliarEnfermagem: getVal(r, "carga horaria de tecnico"),
          cumpriuRequisitoCusteio: getVal(r, "cumpriu requisito"),
        }));

      for (let i = 0; i < records.length; i += batchSize) {
        await raw_db.insert(gerenciaapsOutrosIncentivosPrt20102021).values(records.slice(i, i + batchSize));
      }
    } else if (targetType === "3978") {
      const records = rows
        .filter((r) => getVal(r, "uf") || getVal(r, "ibge") || getVal(r, "municipio"))
        .map((r) => ({
          uf: getVal(r, "uf"),
          municipio: getVal(r, "municipio"),
          ibge: getVal(r, "ibge"),
          compCnes: getVal(r, "comp"),
          cnesSolicitado: getVal(r, "cnes"),
          tipoDaUnidade: getVal(r, "tipo da unidade"),
          unidadeAtiva: getVal(r, "unidade ativa"),
          unidadeValida: getVal(r, "unidade valida"),
          classificacaoValidada: getVal(r, "classificacao validada"),
          qtdeDeMedicos: getVal(r, "qtde de medicos"),
          qtdeDeEnfermeiros: getVal(r, "qtde de enfermeiros"),
          qtdeDeTecnicoAuxiliarEnfermagem: getVal(r, "tecnico/ auxiliar") || getVal(r, "tecnico/auxiliar"),
          cargaHorariaDeMedicos: getVal(r, "carga horaria de medicos"),
          cargaHorariaDeEnfermeiros: getVal(r, "carga horaria de enfermeiros") || getVal(r, "carga horaria de enferemeiros"),
          cargaHorariaDeTecnicoAuxiliarEnfermagem: getVal(r, "carga horaria de tecnico"),
          cumpriuRequisitoCusteio: getVal(r, "cumpriu requisito"),
        }));

      for (let i = 0; i < records.length; i += batchSize) {
        await raw_db.insert(gerenciaapsOutrosIncentivosPrt39782021).values(records.slice(i, i + batchSize));
      }
    } else {
      const records = rows
        .filter((r) => getVal(r, "uf") || getVal(r, "ibge") || getVal(r, "municipio"))
        .map((r) => ({
          uf: getVal(r, "uf"),
          municipio: getVal(r, "municipio"),
          ibge: getVal(r, "ibge"),
          compCnes: getVal(r, "comp"),
          cnesSolicitado: getVal(r, "cnes"),
          tipoDaUnidade: getVal(r, "tipo da unidade"),
          unidadeAtiva: getVal(r, "unidade ativa"),
          unidadeValida: getVal(r, "unidade valida"),
          classificacaoValidada: getVal(r, "classificacao validada"),
          qtdeDeMedicos: getVal(r, "qtde de medicos"),
          qtdeDeEnfermeiros: getVal(r, "qtde de enfermeiros"),
          qtdeDeTecnicoAuxiliarEnfermagem: getVal(r, "tecnico/ auxiliar") || getVal(r, "tecnico/auxiliar"),
          cargaHorariaDeMedicos: getVal(r, "carga horaria de medicos"),
          cargaHorariaDeEnfermeiros: getVal(r, "carga horaria de enfermeiros") || getVal(r, "carga horaria de enferemeiros"),
          cargaHorariaDeTecnicoAuxiliarEnfermagem: getVal(r, "carga horaria de tecnico"),
          cumpriuRequisitoCusteio: getVal(r, "cumpriu requisito"),
        }));

      for (let i = 0; i < records.length; i += batchSize) {
        await raw_db.insert(gerenciaapsOutrosIncentivosPrt3312022).values(records.slice(i, i + batchSize));
      }
    }
  }
}

export async function transformGerenciaapsOutrosIncentivos(): Promise<void> {
  const dirPath = path.resolve(
    process.cwd(),
    "downloads",
    "credenciamento-e-financiamento",
    "gerenciaaps-outros-incentivos"
  );

  let files: string[];
  try {
    files = await fs.readdir(dirPath);
  } catch (error) {
    logger.error({ error, dirPath }, "Diretório não encontrado ou inacessível.");
    return;
  }

  for (const file of files) {
    const filePath = path.join(dirPath, file);
    try {
      if (file.endsWith(".zip")) {
        const fileBuffer = await fs.readFile(filePath);
        const zip = new AdmZip(fileBuffer);
        const zipEntries = zip.getEntries();

        for (const entry of zipEntries) {
          if (
            entry.isDirectory ||
            (!entry.entryName.endsWith(".xlsx") && !entry.entryName.endsWith(".xls"))
          ) {
            continue;
          }
          const entryBuffer = entry.getData();
          const workbook = xlsx.read(entryBuffer, { type: "buffer" });
          await processWorkbook(workbook, entry.entryName, file);
        }
        logger.info({ file }, "Arquivo ZIP processado com sucesso.");
      } else if (file.endsWith(".xlsx") || file.endsWith(".xls")) {
        const fileBuffer = await fs.readFile(filePath);
        const workbook = xlsx.read(fileBuffer, { type: "buffer" });
        await processWorkbook(workbook, file, file);
        logger.info({ file }, "Arquivo Excel processado com sucesso.");
      }
    } catch (error) {
      logger.error({ error, file }, "Erro ao processar arquivo de outros incentivos.");
    }
  }
}