import * as vscode from 'vscode';
import { BigQuery } from '@google-cloud/bigquery';

import { replaceParameters, replaceTables } from './replace';

export function activate(context: vscode.ExtensionContext) {
  const client = new BigQuery();

  let disposable = vscode.commands.registerCommand(
    'bq-query-viewer.get-sql',
    async () => {
      try {
        const input = await vscode.window.showInputBox({
          placeHolder: "Job ID (e.g. '23f0b956-4fc3-48a7-a8d0-0ccebf9fdcd8')",
        });

        if (!input) {
          throw new Error('Job ID is required!');
        }

        const getJobId = (input: string) => {
          const [_location, _jobId] = input.split('.');

          if (!_jobId) {
            const extensionConfig =
              vscode.workspace.getConfiguration('bg-query-viewer');
            const defaultLocation = extensionConfig.get(
              'defaultLocation'
            ) as string;
            return [defaultLocation, input];
          }
          return [_location, _jobId];
        };

        const [location, jobId] = getJobId(input);

        const job = client.job(jobId, { location });

        const [metadata] = await job.getMetadata();

        if (metadata.configuration.jobType !== 'QUERY') {
          vscode.window.showErrorMessage('This job is not a query job!');
          return;
        }

        const sql = metadata.configuration.query.query;
        const parameters: {
          name: string
          parameterType: { type: string }
          parameterValue: { value: string }
        }[] = metadata.configuration.query.queryParameters;
        const tables: {
          projectId: string
          datasetId: string
          tableId: string
        }[] = metadata.statistics.query.referencedTables;

        const simpleFormatParameters = parameters.map(p => ({
          name: p.name,
          type: p.parameterType.type,
          value: p.parameterValue.value,
        }));

        const applications: ((s: string) => string)[] = [
          s => replaceParameters(s, simpleFormatParameters),
          s => replaceTables(s, tables),
        ];

        const jobIdText = `-- ${jobId}`;

        const paramText =
          '-- Params:\n' +
          simpleFormatParameters
            .map(p => `${p.name} = ${p.value}`)
            .map(v => `-- ${v}`)
            .join('\n');

        const renderedSql = applications.reduce((s, f) => f(s), sql);

        const document = await vscode.workspace.openTextDocument({
          language: 'sql',
          content: [jobIdText, paramText, renderedSql].join('\n\n'),
        });

        await vscode.window.showTextDocument(document);
      } catch (error) {
        if (error instanceof Error) {
          vscode.window.showErrorMessage(error.message);
          return;
        }
        throw error;
      }
    }
  );

  context.subscriptions.push(disposable);
}

export function deactivate() {}
