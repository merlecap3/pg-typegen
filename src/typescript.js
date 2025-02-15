'use strict'

function sortIgnoreCase (a, b) {
  if (a.toLowerCase() < b.toLowerCase()) {
    return -1
  }

  if (a.toLowerCase() > b.toLowerCase()) {
    return 1
  }

  return 0
}

function sortByField (name) {
  return function (a, b) {
    const valA = a[name]
    const valB = b[name]
    return sortIgnoreCase(valA, valB)
  }
}

function toPascalCase (value) {
  let replaced = value.replace(/((_|-|\s)\w)/g, (token) => token[1].toUpperCase())
  replaced = replaced.charAt(0).toUpperCase() + replaced.slice(1)
  replaced = replaced.replace(/_|-|\s/g, '')
  return replaced
}

function formatName (name) {
  if (name.match(/(-|\s)/g)) {
    name = `'${name}'`
  }
  return name
}

function formatEnumName (opts, name) {
  if (opts.pascalEnums) {
    return toPascalCase(name)
  }

  return formatName(name)
}

function semicolon (opts) {
  return opts.semicolons ? ';' : ''
}

function getColumnType (typeMapping, type, enums) {
  const result = Object.entries(typeMapping).find(([_key, values]) => values.includes(type))

  if (!result || !result[0]) {
    const customType = enums.find(entry => entry.name === (type.startsWith('_') ? type.slice(1) : type))
    if (customType) {
      return type.startsWith('_') ? `Array<${toPascalCase(type)}>` : toPascalCase(type)
    }
  }

  if (!result || !result[0]) {
    return type.startsWith('_') ? 'Array<any>' : 'any'
  }
  return result[0]
}

function getParsedTableName(tableName) {
  let parsedTableName = toPascalCase(tableName)
  if (parsedTableName.endsWith('ies')) {
    parsedTableName = parsedTableName.slice(0, -3) + 'y'
  } else if (parsedTableName.endsWith('sses')) {
    parsedTableName = parsedTableName.slice(0, -2)
  } else if (parsedTableName.endsWith('ess')) {
    /* handle words like address -> AddressEntity */
  } else if (parsedTableName.endsWith('s')) {
    parsedTableName = parsedTableName.slice(0, -1)
  }
  return parsedTableName
}

function getTableType (opts, tableName, suffix) {
  const parsedTableName = getParsedTableName(tableName)

  if (opts.type) {
    return `export type ${parsedTableName}${suffix} = {`
  } else {
    return `export interface ${parsedTableName}${suffix} {`
  }
}

function formatColumnComment (opts, column) {
  if (!opts.comments) {
    return ''
  }

  const isPrimaryKey = Array.isArray(column.indices) && column.indices.find(index => index.isPrimaryKey)
  if (!column.comment && !isPrimaryKey) {
    return ''
  }

  let result = ''
  result += '  /**\n'
  if (column.comment) {
    result += `   * ${column.comment}\n`
  }
  if (isPrimaryKey) {
    result += '   * PRIMARY KEY\n'
  }

  result += '  */\n'

  return result
}

function formatTableComment (opts, table) {
  if (!opts.comments || !table.comment) {
    return ''
  }

  return `/**\n * ${table.comment}\n*/\n`
}

function generateTableTypes (opts, tables, typeMapping, enums) {
  return tables
    .filter(table => !opts.exclude.includes(table.name))
    .sort(sortByField('name'))
    .map(table => {
      let result = ''

      result += formatTableComment(opts, table)
      result += getTableType(opts, table.name, opts.suffix)

      if (table.columns.length > 0) {
        result += '\n'
      }

      table.columns
        .sort(sortByField('name'))
        .forEach(tableColumn => {
          result += formatColumnComment(opts, tableColumn)
          result += `  ${formatName(tableColumn.name)}${tableColumn.isNullable && opts.optionals ? '?' : ''}: ${getColumnType(typeMapping, tableColumn.type, enums)}${tableColumn.isNullable && !opts.optionals ? ' | null' : ''}${semicolon(opts)}\n`
        })

      result += `}${semicolon(opts)}\n`

      if (opts.insertTypes && !table.isView) {
        result += '\n'
        result += formatTableComment(opts, table)
        result += getTableType(opts, table.name, `Insert${opts.suffix}`)

        if (table.columns.length > 0) {
          result += '\n'
        }

        table.columns
          .sort(sortByField('name'))
          .forEach(tableColumn => {
            result += formatColumnComment(opts, tableColumn)
            result += `  ${formatName(tableColumn.name)}${tableColumn.isNullable || tableColumn.hasDefault ? '?' : ''}: ${getColumnType(typeMapping, tableColumn.type, enums)}${tableColumn.isNullable && !opts.optionals ? ' | null' : ''}${semicolon(opts)}\n`
          })

        result += `}${semicolon(opts)}\n`
      }

      return result
    }).join('\n')
}

function generateEnumTypes (opts, enums) {
  const enumTypes = enums
    .filter(entry => !opts.exclude.includes(entry.name))
    .sort(sortByField('name'))
    .map(entry => {
      let enumType = `export enum ${toPascalCase(entry.name)} {`

      if (entry.values.length > 0) {
        enumType += '\n'
      }

      entry.values.sort(sortIgnoreCase).forEach(value => {
        enumType += `  ${formatEnumName(opts, value)} = '${value}',\n`
      })

      enumType += '}\n'
      return enumType
    })

  return enumTypes.join('\n')
}

function typescript (opts, schema) {
  const { tables, typeMapping, enums } = schema
  const { header } = opts

  let result = ''
  if (header) {
    result += header
    result += '\n\n'
  }

  if (opts.tableNames) {
    result += `export type Tables = ${tables.filter(table => !table.isView && !opts.exclude.includes(table.name)).map(table => `'${table.name}'`).join(' | ')}${semicolon(opts)}`
    result += '\n\n'
    result += `export enum Table { 
    ${tables.filter(table => !table.isView && !opts.exclude.includes(table.name)).map(table => `${getParsedTableName(table.name)} = '${table.name}'`).join(', \n    ')}${semicolon(opts)}
}`
    result += '\n\n'
  }

  const enumTypes = generateEnumTypes(opts, enums)
  if (enumTypes) {
    result += enumTypes
    result += '\n'
  }
  result += generateTableTypes(opts, tables, typeMapping, enums)
  return result
}

module.exports = typescript
