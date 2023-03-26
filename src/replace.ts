interface Parameter {
  name: string;
  type: string;
  value: string;
}

interface Table {
  projectId: string;
  datasetId: string;
  tableId: string;
}

/**
 * STRINGのパラメータを置換する
 *
 * TODO テーブル名置換のように、パラメータキー中に正規表現の
 *      メタ文字のエスケープって必要？
 *
 * @param sql SQL
 * @param param 置換パラメータ
 * @returns パラメータを置換したSQL
 */
const replaceString = (sql: string, param: Parameter) => {
  const re = new RegExp(`@\\b${param.name}\\b`, "g");
  return sql.replace(re, `'${param.value}'`);
};

const replaceInt64 = (sql: string, param: Parameter) => {
  const re = new RegExp(`@\\b${param.name}\\b`, "g");
  return sql.replace(re, param.value);
};

const replaceFunctions = new Map<
  string,
  (sql: string, param: Parameter) => string
>([
  ["STRING", replaceString],
  ["DATE", replaceString],
  ["INT64", replaceInt64],
]);

/**
 * パラメータの置換
 *
 * @param sql SQL
 * @param parameters 置換するパラメータ
 * @returns パラメータを置換したSQL
 */
export function replaceParameters(
  sql: string,
  parameters: Parameter[],
): string {
  return parameters.reduce((s, p) => {
    const f = replaceFunctions.get(p.type);
    if (!f) {
      throw new Error(`Unknown parameter type: ${p.type}`);
    }
    return f(s, p);
  }, sql);
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
    const normalizedTableId = t.tableId;
    // 既にテーブルの完全名になっている場合は置換しない
    const re = new RegExp(`(^|[^\\.]\\b)${normalizedTableId}\\b`, "g");

    return s.replace(re, `$1\`${t.projectId}.${t.datasetId}.${t.tableId}\``);
  }, sql);
}
