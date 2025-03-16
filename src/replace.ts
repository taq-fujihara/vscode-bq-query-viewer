// TODO more
type ScalarParameterTypeName = "STRING" | "DATE" | "INT64" | "BOOL";

export type ScalarParameter = {
  name: string;
  parameterType: {
    type: ScalarParameterTypeName;
  };
  parameterValue: {
    // value is always string even if parameterType is, for example, INT64.
    value: string | null;
  };
};

export type ArrayParameter = {
  name: string;
  parameterType: {
    type: "ARRAY";
    arrayType: {
      type: ScalarParameterTypeName;
    };
  };
  parameterValue: {
    arrayValues:
      | {
          value: string;
        }[]
      | null;
  };
};

export type Table = {
  projectId: string;
  datasetId: string;
  tableId: string;
};

const paramRegex = (name: string) => new RegExp(`@\\b${name}\\b`, "g");

// TODO escape
const valueMapper: Record<ScalarParameterTypeName, (value: string) => string> =
  {
    STRING: (value) => `'${value}'`,
    DATE: (value) => `date '${value}'`,
    INT64: (value) => value,
    BOOL: (value) => value,
  };

export function replaceParameters(
  query: string,
  parameters: (ScalarParameter | ArrayParameter)[]
) {
  return parameters.reduce((q, p) => replaceParameter(q, p), query);
}

function replaceParameter(
  query: string,
  parameter: ScalarParameter | ArrayParameter
) {
  if (parameter.parameterType.type === "ARRAY") {
    return replaceArrayParameter(query, parameter as ArrayParameter);
  }

  return replaceScalarParameter(query, parameter as ScalarParameter);
}

function replaceArrayParameter(
  query: string,
  parameter: ArrayParameter
): string {
  const re = paramRegex(parameter.name);

  if (parameter.parameterValue.arrayValues === null) {
    return query.replace(re, "null");
  }

  const elementType = parameter.parameterType.arrayType.type;

  const mapper = valueMapper[elementType];

  if (!mapper) {
    console.warn(
      `Parameter Type Not Supported: ${parameter.parameterType.type}`
    );
    return query;
  }

  const replaceToValue = parameter.parameterValue.arrayValues
    .map((parameterValue) => parameterValue.value)
    .map(mapper)
    .join(", ");

  return query.replace(re, toParamText(parameter.name, `[${replaceToValue}]`));
}

function replaceScalarParameter(
  query: string,
  parameter: ScalarParameter
): string {
  const re = paramRegex(parameter.name);

  if (parameter.parameterValue.value === null) {
    return query.replace(re, "null");
  }

  const mapper = valueMapper[parameter.parameterType.type];

  if (!mapper) {
    console.warn(
      `Parameter Type Not Supported: ${parameter.parameterType.type}`
    );
    return query;
  }

  const replaceToValue = mapper(parameter.parameterValue.value);

  return query.replace(re, toParamText(parameter.name, replaceToValue));
}

export function replaceTableIds(query: string, tables: Table[]) {
  return tables.reduce((q, t) => {
    return replaceTableId(q, t);
  }, query);
}

export function replaceTableId(query: string, table: Table) {
  // can be already full table id
  const re = new RegExp(`(^|[^\\.]\\b)${table.tableId}\\b`, "g");

  const newQuery = query.replace(
    re,
    `$1\`${table.projectId}.${table.datasetId}.${table.tableId}\``
  );

  return newQuery;
}

function toParamText(name: string, value: string) {
  return `${value} /* = @${name} */`;
}
