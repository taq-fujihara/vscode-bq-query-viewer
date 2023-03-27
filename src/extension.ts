import * as vscode from 'vscode'
import { BigQuery } from '@google-cloud/bigquery'

import {
  PossibleParameterType,
  replaceParameters,
  replaceTables,
} from './replace'

export function activate(context: vscode.ExtensionContext) {
  const client = new BigQuery()

  let disposable = vscode.commands.registerCommand(
    'bq-query-viewer.get-sql',
    async () => {
      try {
        // TODO refactoring

        const input = await vscode.window.showInputBox({
          placeHolder: "Job ID (e.g. '23f0b956-4fc3-48a7-a8d0-0ccebf9fdcd8')",
        })

        if (!input) {
          throw new Error('Job ID is required!')
        }

        const getJobId = (input: string) => {
          const [_location, _jobId] = input.split('.')

          if (!_jobId) {
            const extensionConfig =
              vscode.workspace.getConfiguration('bg-query-viewer')
            const defaultLocation = extensionConfig.get(
              'defaultLocation'
            ) as string
            return [defaultLocation, input]
          }
          return [_location, _jobId]
        }

        const [location, jobId] = getJobId(input)

        const job = client.job(jobId, { location })

        const [metadata] = await job.getMetadata()

        if (metadata.configuration.jobType !== 'QUERY') {
          vscode.window.showErrorMessage('This job is not a query job!')
          return
        }

        const sql = metadata.configuration.query.query
        const parameters: {
          name: string
          parameterType: any
          parameterValue: { value: any; arrayValues: any[] }
        }[] = metadata.configuration.query.queryParameters || []

        const tables: {
          projectId: string
          datasetId: string
          tableId: string
        }[] = metadata.statistics.query.referencedTables || []

        const [children] = await client.getJobs({
          parentJobId: job.id,
          maxResults: 100,
        })

        for (const child of children) {
          const [metadata] = await child.getMetadata()
          if (metadata.statistics.query.referencedTables) {
            for (const t of metadata.statistics.query.referencedTables) {
              if (t.datasetId.startsWith('_')) {
                continue
              }
              if (tables.find(_t => _t.tableId === t.tableId)) {
                continue
              }
              tables.push({
                projectId: t.projectId,
                datasetId: t.datasetId,
                tableId: t.tableId,
              })
            }
          }
        }

        const simpleFormatParameters = parameters.map(p => {
          if (p.parameterType.type === 'ARRAY') {
            return {
              name: p.name,
              type: p.parameterType.arrayType.type,
              array: true,
              value: p.parameterValue.arrayValues.map(v => v.value),
            }
          } else {
            return {
              name: p.name,
              type: p.parameterType.type,
              array: false,
              value: p.parameterValue.value,
            }
          }
        })

        const applications: ((s: string) => string)[] = [
          s => replaceParameters(s, simpleFormatParameters),
          s => replaceTables(s, tables),
        ]

        const jobIdText = `-- ${jobId}`

        const paramText =
          '-- Params:\n' +
          simpleFormatParameters
            .map(p => `${p.name} = ${p.value}`)
            .map(v => `-- ${v}`)
            .join('\n')

        const renderedSql = applications.reduce((s, f) => f(s), sql)

        const document = await vscode.workspace.openTextDocument({
          language: 'sql',
          content: [jobIdText, paramText, renderedSql].join('\n\n'),
        })

        await vscode.window.showTextDocument(document)
      } catch (error) {
        if (error instanceof Error) {
          vscode.window.showErrorMessage(error.message)
          return
        }
        throw error
      }
    }
  )

  context.subscriptions.push(disposable)
}

export function deactivate() {}
