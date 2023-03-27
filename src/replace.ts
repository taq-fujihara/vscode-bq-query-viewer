export type PossibleParameterType = 'STRING' | 'DATE' | 'INT64' | 'BOOL'

interface Parameter {
  name: string
  array: boolean
  type: PossibleParameterType
  value: string | number | boolean | string[] | number[] | boolean[]
}

interface Table {
  projectId: string
  datasetId: string
  tableId: string
}

const paramRegex = (name: string) => new RegExp(`@\\b${name}\\b`, 'g')

const mappers = {
  STRING: (v: any) => `'${v}'`,
  DATE: (v: any) => `date '${v}'`,
  INT64: (v: any) => v.toString(),
  BOOL: (v: any) => v.toString(),
}

const mapParam = (sql: string, param: Parameter) => {
  const re = paramRegex(param.name)
  const mapper = mappers[param.type]
  if (!mapper) {
    throw new Error(`Unknown type: ${param.type}`)
  }

  let replaceBy: string

  if (param.array) {
    const _values = param.value as string[] | number[] | boolean[]
    replaceBy = `[${_values.map(mapper).join(', ')}]`
  } else {
    replaceBy = mapper(param.value)
  }

  return sql.replace(re, replaceBy)
}

/**
 * パラメータの置換
 *
 * @param sql SQL
 * @param parameters 置換するパラメータ
 * @returns パラメータを置換したSQL
 */
export function replaceParameters(
  sql: string,
  parameters: Parameter[]
): string {
  return parameters.reduce((s, param) => {
    return mapParam(s, param)
  }, sql)
}

/**
 * テーブル名の置換
 *
 * デフォルトデータセットを指定した状態でSQLを発行すると、
 * SQLでのテーブル指定はテーブル名だけで良くなります。
 * Cloud ConsoleでそのSQLを発行しようとするとデータセットが
 * 不明でエラーになるため、完全なテーブルIDに置換します。
 *
 * ただし、これはただの文字列置換しかしていないので、CTEなど
 * が実際のテーブル名と被っている場合それも置換されてしまいます。
 *
 * @param sql SQL
 * @param tables 参照テーブル
 * @returns テーブル名を置換したSQL
 */
export function replaceTables(sql: string, tables: Table[]): string {
  return tables.reduce((s, t) => {
    // TODO テーブルID中に正規表現のメタ文字が入る場合はエスケープしないとだが...
    const normalizedTableId = t.tableId
    // 既にテーブルの完全名になっている場合は置換しない
    const re = new RegExp(`(^|[^\\.]\\b)${normalizedTableId}\\b`, 'g')

    return s.replace(re, `$1\`${t.projectId}.${t.datasetId}.${t.tableId}\``)
  }, sql)
}
