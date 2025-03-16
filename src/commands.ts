import * as vscode from "vscode";
import { BigQuery, type Job } from "@google-cloud/bigquery";
import {
  replaceParameters,
  replaceTableIds,
  type ArrayParameter,
  type ScalarParameter,
} from "./replace";

type JobIdentifier = {
  projectId: string;
  location: string;
  jobId: string;
};

type JobMetadata = {
  defaultDataset: {
    projectId: string;
    datasetId: string;
  };
  query: string;
  parameters: (ScalarParameter | ArrayParameter)[];
  tables: {
    projectId: string;
    datasetId: string;
    tableId: string;
  }[];
};

export async function printSql() {
  const input = await vscode.window.showInputBox({
    placeHolder:
      "Job ID (e.g. 'your-project-id.asia-northeast1.job_MguwKgVHkZxlZs0CZxP7icPLJrkB')",
  });

  if (!input) {
    throw new Error("Job ID is required!");
  }

  const { projectId, location, jobId } = await parseInput(input);

  vscode.window.showInformationMessage(`Fetching job ${jobId}...`);

  const client = new BigQuery({
    projectId,
    location,
  });

  const job = client.job(jobId);

  const metadata = await extractJobMetadata(job);

  const allTableIdsInDefaultDataste = await getAllTables(
    client,
    metadata.defaultDataset.datasetId
  );

  const [children] = await client.getJobs({
    parentJobId: job.id,
    autoPaginate: true,
  });

  for (const childJob of children) {
    const childMetadata = await extractJobMetadata(childJob);

    for (const tableRef of childMetadata.tables) {
      if (tableRef.datasetId.startsWith("_")) {
        // this is a temporary dataset
        continue;
      }
      if (metadata.tables.find((_t) => _t.tableId === tableRef.tableId)) {
        // already exists in parent job table list
        continue;
      }

      metadata.tables.push({
        projectId: tableRef.projectId,
        datasetId: tableRef.datasetId,
        tableId: tableRef.tableId,
      });
    }
  }

  // Tables that are not in the default dataset of the query are excluded,
  // because they should be already written as full table id in the query.
  metadata.tables = metadata.tables.filter((table) =>
    allTableIdsInDefaultDataste.includes(table.tableId)
  );

  let query = metadata.query;
  query = replaceParameters(query, metadata.parameters);
  query = replaceTableIds(query, metadata.tables);

  const header = `/*
Job: ${input}
Default Dataset: ${metadata.defaultDataset.projectId}.${
    metadata.defaultDataset.datasetId
  }
Parameters:
  ${metadata.parameters.map(toHeaderText).join("\n  ")}
*/`;

  const document = await vscode.workspace.openTextDocument({
    language: "sql",
    content: [header, query].join("\n\n"),
  });

  await vscode.window.showTextDocument(document);
}

async function parseInput(input: string): Promise<JobIdentifier> {
  const elements = input.split(".");

  if (elements.length === 2) {
    // retry with "project:location.job_id" format
    const projectAndLocation = elements[0].split(":");

    if (projectAndLocation.length !== 2) {
      throw new Error(
        "Invalid input format! Please provide a valid [Project ID].[Location].[Job ID]."
      );
    }

    return {
      projectId: projectAndLocation[0],
      location: projectAndLocation[1],
      jobId: elements[1],
    };
  }

  if (elements.length !== 3) {
    throw new Error(
      "Invalid input format! Please provide a valid [Project ID].[Location].[Job ID]."
    );
  }

  return {
    projectId: elements[0],
    location: elements[1],
    jobId: elements[2],
  };
}

async function extractJobMetadata(job: Job): Promise<JobMetadata> {
  const [metadata] = await job.getMetadata();

  if (metadata.configuration.jobType !== "QUERY") {
    throw new Error("This job is not a query job!");
  }

  const parameters = (metadata.configuration.query.queryParameters || []).map(
    (parameter: any) => {
      if (parameter.parameterType.type === "ARRAY") {
        return {
          name: parameter.name,
          parameterType: parameter.parameterType,
          // value is NOT always present
          parameterValue: parameter.parameterValue || { arrayValues: null },
        };
      }

      return {
        name: parameter.name,
        parameterType: parameter.parameterType,
        // value is NOT always present
        parameterValue: parameter.parameterValue || { value: null },
      };
    }
  );

  return {
    defaultDataset: metadata.configuration.query.defaultDataset,
    query: metadata.configuration.query.query,
    parameters,
    tables: metadata.statistics.query.referencedTables || [],
  };
}

async function getAllTables(
  client: BigQuery,
  datasetId: string
): Promise<string[]> {
  const [tables] = await client
    .dataset(datasetId)
    .getTables({ autoPaginate: true });

  const _tables: string[] = [];

  for (const table of tables) {
    if (table.id !== undefined) {
      _tables.push(table.id);
    }
  }

  return _tables;
}

function toHeaderText(parameter: ScalarParameter | ArrayParameter): string {
  if (parameter.parameterType.type === "ARRAY") {
    const p = parameter as ArrayParameter;
    return `${p.name}: ${p.parameterValue.arrayValues
      ?.map((v) => v.value)
      .join(", ")}`;
  }

  const p = parameter as ScalarParameter;

  return `${p.name}: ${
    p.parameterValue.value === null ? "null" : p.parameterValue.value
  }`;
}
