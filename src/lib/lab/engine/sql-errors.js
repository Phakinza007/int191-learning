// MySQL-shaped errors: code / errno / sqlState / sqlMessage exactly as a MySQL 8.0 server reports them.

export class SqlError extends Error {
  constructor(code, errno, sqlMessage, sqlState = 'HY000') {
    super(sqlMessage);
    this.code = code;
    this.errno = errno;
    this.sqlState = sqlState;
    this.sqlMessage = sqlMessage;
  }
}

export const err = (code, errno, msg, state) => new SqlError(code, errno, msg, state);
export const unsupported = (sql) => err('SIM_UNSUPPORTED_SQL', 0, `simulator ยังไม่รองรับ SQL นี้: ${String(sql).trim().slice(0, 80)}`);

export function syntaxError(sql, pos) {
  const at = pos == null || pos > sql.length ? sql.length : pos;
  const line = sql.slice(0, at).split('\n').length;
  return err('ER_PARSE_ERROR', 1064,
    `You have an error in your SQL syntax; check the manual that corresponds to your MySQL server version for the right syntax to use near '${sql.slice(at, at + 80)}' at line ${line}`, '42000');
}

const q = (n) => '`' + n + '`';

export const E = {
  noDb: () => err('ER_NO_DB_ERROR', 1046, 'No database selected', '3D000'),
  badDb: (name) => err('ER_BAD_DB_ERROR', 1049, `Unknown database '${name}'`, '42000'),
  dbExists: (name) => err('ER_DB_CREATE_EXISTS', 1007, `Can't create database '${name}'; database exists`),
  dbDropMissing: (name) => err('ER_DB_DROP_EXISTS', 1008, `Can't drop database '${name}'; database doesn't exist`),
  noTable: (db, name) => err('ER_NO_SUCH_TABLE', 1146, `Table '${db}.${name}' doesn't exist`, '42S02'),
  tableExists: (name) => err('ER_TABLE_EXISTS_ERROR', 1050, `Table '${name}' already exists`, '42S01'),
  badTable: (list) => err('ER_BAD_TABLE_ERROR', 1051, `Unknown table '${list}'`, '42S02'),
  badField: (name, where) => err('ER_BAD_FIELD_ERROR', 1054, `Unknown column '${name}' in '${where}'`, '42S22'),
  ambiguous: (name, where) => err('ER_NON_UNIQ_ERROR', 1052, `Column '${name}' in ${where} is ambiguous`, '23000'),
  nonUniqTable: (alias) => err('ER_NONUNIQ_TABLE', 1066, `Not unique table/alias: '${alias}'`, '42000'),
  dupFieldName: (name) => err('ER_DUP_FIELDNAME', 1060, `Duplicate column name '${name}'`, '42S21'),
  derivedAlias: () => err('ER_DERIVED_MUST_HAVE_ALIAS', 1248, 'Every derived table must have its own alias', '42000'),
  wrongArgs: () => err('ER_WRONG_ARGUMENTS', 1210, 'Incorrect arguments to mysqld_stmt_execute'),
  // expressions
  groupFuncUse: () => err('ER_INVALID_GROUP_FUNC_USE', 1111, 'Invalid use of group function'),
  cantGroupOn: (name) => err('ER_WRONG_GROUP_FIELD', 1056, `Can't group on '${name}'`, '42000'),
  operandColumns: (n) => err('ER_OPERAND_COLUMNS', 1241, `Operand should contain ${n} column(s)`, '21000'),
  subqueryRows: () => err('ER_SUBQUERY_NO_1_ROW', 1242, 'Subquery returns more than 1 row', '21000'),
  noFunction: (db, name) => err('ER_SP_DOES_NOT_EXIST', 1305, `FUNCTION ${db}.${name} does not exist`, '42000'),
  paramCount: (name) => err('ER_WRONG_PARAMCOUNT_TO_NATIVE_FCT', 1582, `Incorrect parameter count in the call to native function '${name}'`, '42000'),
  divByZero: () => err('ER_DIVISION_BY_ZERO', 1365, 'Division by 0', '22012'),
  notGrouped: (n, clause, col) => err('ER_WRONG_FIELD_WITH_GROUP', 1055,
    `Expression #${n} of ${clause} is not in GROUP BY clause and contains nonaggregated column '${col}' which is not functionally dependent on columns in GROUP BY clause; this is incompatible with sql_mode=only_full_group_by`, '42000'),
  mixGroup: (n, col) => err('ER_MIX_OF_GROUP_FUNC_AND_FIELDS', 1140,
    `In aggregated query without GROUP BY, expression #${n} of SELECT list contains nonaggregated column '${col}'; this is incompatible with sql_mode=only_full_group_by`, '42000'),
  orderNotSelected: (n, col) => err('ER_FIELD_IN_ORDER_NOT_SELECT', 3065,
    `Expression #${n} of ORDER BY clause is not in SELECT list, references column '${col}' which is not in SELECT list; this is incompatible with DISTINCT`),
  updateTableUsed: (name) => err('ER_UPDATE_TABLE_USED', 1093, `You can't specify target table '${name}' for update in FROM clause`),
  unknownSysVar: (name) => err('ER_UNKNOWN_SYSTEM_VARIABLE', 1193, `Unknown system variable '${name}'`),
  readOnlyVar: (name) => err('ER_INCORRECT_GLOBAL_LOCAL_VAR', 1238, `Variable '${name}' is a read only variable`),
  fieldTwice: (name) => err('ER_FIELD_SPECIFIED_TWICE', 1110, `Column '${name}' specified twice`, '42000'),
  keyMissing: (name, table) => err('ER_KEY_DOES_NOT_EXITS', 1176, `Key '${name}' doesn't exist in table '${table}'`, '42000'),
  wrongVarValue: (name, v) => err('ER_WRONG_VALUE_FOR_VAR', 1231, `Variable '${name}' can't be set to the value of '${v}'`, '42000'),
  // data
  dupEntry: (vals, table, key) => err('ER_DUP_ENTRY', 1062, `Duplicate entry '${vals}' for key '${table}.${key}'`, '23000'),
  badNull: (col) => err('ER_BAD_NULL_ERROR', 1048, `Column '${col}' cannot be null`, '23000'),
  noDefault: (col) => err('ER_NO_DEFAULT_FOR_FIELD', 1364, `Field '${col}' doesn't have a default value`),
  tooLong: (col, row) => err('ER_DATA_TOO_LONG', 1406, `Data too long for column '${col}' at row ${row}`, '22001'),
  truncated: (col, row) => err('WARN_DATA_TRUNCATED', 1265, `Data truncated for column '${col}' at row ${row}`, '01000'),
  wrongValue: (kind, v, col, row) => err('ER_TRUNCATED_WRONG_VALUE_FOR_FIELD', 1366, `Incorrect ${kind} value: '${v}' for column '${col}' at row ${row}`),
  badDate: (kind, v, col, row) => err('ER_TRUNCATED_WRONG_VALUE', 1292, `Incorrect ${kind} value: '${v}' for column '${col}' at row ${row}`, '22007'),
  outOfRange: (col, row) => err('ER_WARN_DATA_OUT_OF_RANGE', 1264, `Out of range value for column '${col}' at row ${row}`, '22003'),
  valueCount: (row) => err('ER_WRONG_VALUE_COUNT_ON_ROW', 1136, `Column count doesn't match value count at row ${row}`, '21S01'),
  invalidNull: () => err('ER_INVALID_USE_OF_NULL', 1138, 'Invalid use of NULL value', '22004'),
  checkViolated: (name) => err('ER_CHECK_CONSTRAINT_VIOLATED', 3819, `Check constraint '${name}' is violated.`),
  // foreign keys
  noParentRow: (detail) => err('ER_NO_REFERENCED_ROW_2', 1452, `Cannot add or update a child row: a foreign key constraint fails ${detail}`, '23000'),
  rowReferenced: (detail) => err('ER_ROW_IS_REFERENCED_2', 1451, `Cannot delete or update a parent row: a foreign key constraint fails ${detail}`, '23000'),
  fkCascadeDepth: () => err('ER_FK_DEPTH_EXCEEDED', 3008, 'Foreign key cascade delete/update exceeds max depth of 15.'),
  fkNoParent: (name) => err('ER_FK_CANNOT_OPEN_PARENT', 1824, `Failed to open the referenced table '${name}'`),
  fkNoIndex: (fk, table) => err('ER_FK_NO_INDEX_PARENT', 1822, `Failed to add the foreign key constraint. Missing index for constraint '${fk}' in the referenced table '${table}'`),
  fkMissingColumn: (col, fk, table) => err('ER_FK_NO_COLUMN_PARENT', 3734, `Failed to add the foreign key constraint. Missing column '${col}' for constraint '${fk}' in the referenced table '${table}'`),
  fkIncompatible: (col, ref, fk) => err('ER_FK_INCOMPATIBLE_COLUMNS', 3780, `Referencing column '${col}' and referenced column '${ref}' in foreign key constraint '${fk}' are incompatible.`),
  fkSetNullNotNull: (col, fk) => err('ER_FK_COLUMN_NOT_NULL', 1830, `Column '${col}' cannot be NOT NULL: needed in a foreign key constraint '${fk}' SET NULL`),
  fkDupName: (name) => err('ER_FK_DUP_NAME', 1826, `Duplicate foreign key constraint name '${name}'`),
  fkDropParent: (table, fk, child) => err('ER_FK_CANNOT_DROP_PARENT', 3730, `Cannot drop table '${table}' referenced by a foreign key constraint '${fk}' on table '${child}'.`),
  fkDropIndex: (name) => err('ER_DROP_INDEX_FK', 1553, `Cannot drop index '${name}': needed in a foreign key constraint`),
  fkDropColumn: (col, fk) => err('ER_FK_COLUMN_CANNOT_DROP', 1828, `Cannot drop column '${col}': needed in a foreign key constraint '${fk}'`),
  fkDropRefColumn: (col, fk, table) => err('ER_FK_COLUMN_CANNOT_DROP_CHILD', 1829, `Cannot drop column '${col}': needed in a foreign key constraint '${fk}' of table '${table}'`),
  truncateReferenced: (detail) => err('ER_TRUNCATE_ILLEGAL_FK', 1701, `Cannot truncate a table referenced in a foreign key constraint ${detail}`, '42000'),
  // DDL
  keyColumnMissing: (col) => err('ER_KEY_COLUMN_DOES_NOT_EXITS', 1072, `Key column '${col}' doesn't exist in table`, '42000'),
  multiplePk: () => err('ER_MULTIPLE_PRI_KEY', 1068, 'Multiple primary key defined', '42000'),
  wrongAutoKey: () => err('ER_WRONG_AUTO_KEY', 1075, 'Incorrect table definition; there can be only one auto column and it must be defined as a key', '42000'),
  wrongColumnSpec: (col) => err('ER_WRONG_FIELD_SPEC', 1063, `Incorrect column specifier for column '${col}'`, '42000'),
  invalidDefault: (col) => err('ER_INVALID_DEFAULT', 1067, `Invalid default value for '${col}'`, '42000'),
  blobDefault: (col) => err('ER_BLOB_CANT_HAVE_DEFAULT', 1101, `BLOB, TEXT, GEOMETRY or JSON column '${col}' can't have a default value`, '42000'),
  dupKeyName: (name) => err('ER_DUP_KEYNAME', 1061, `Duplicate key name '${name}'`, '42000'),
  cantDrop: (name) => err('ER_CANT_DROP_FIELD_OR_KEY', 1091, `Can't DROP '${name}'; check that column/key exists`, '42000'),
  dropAllColumns: () => err('ER_CANT_REMOVE_ALL_FIELDS', 1090, "You can't delete all columns with ALTER TABLE; use DROP TABLE instead", '42000'),
  constraintMissing: (name) => err('ER_CONSTRAINT_NOT_FOUND', 3940, `Constraint '${name}' does not exist.`),
  checkMissing: (name) => err('ER_CHECK_CONSTRAINT_NOT_FOUND', 3821, `Check constraint '${name}' is not found in the table.`),
  checkDupName: (name) => err('ER_CHECK_CONSTRAINT_DUP_NAME', 3822, `Duplicate check constraint name '${name}'.`),
  checkUnknownColumn: (name, col) => err('ER_CHECK_CONSTRAINT_REFERS_UNKNOWN_COLUMN', 3820, `Check constraint '${name}' refers to non-existing column '${col}'.`),
  checkOtherColumn: (name) => err('ER_COLUMN_CHECK_CONSTRAINT_REFERENCES_OTHER_COLUMN', 3813, `Column check constraint '${name}' references other column.`),
  checkFunction: (name, fn) => err('ER_CHECK_CONSTRAINT_NAMED_FUNCTION_IS_NOT_ALLOWED', 3814, `An expression of a check constraint '${name}' contains disallowed function: ${fn}.`),
  checkSubquery: (name) => err('ER_CHECK_CONSTRAINT_FUNCTION_IS_NOT_ALLOWED', 3815, `An expression of a check constraint '${name}' contains disallowed function.`),
  checkVariable: (name) => err('ER_CHECK_CONSTRAINT_VARIABLES', 3816, `An expression of a check constraint '${name}' cannot refer to a user or system variable.`),
  checkAutoInc: (name) => err('ER_CHECK_CONSTRAINT_REFERS_AUTO_INCREMENT_COLUMN', 3818, `Check constraint '${name}' cannot refer to an auto-increment column.`),
  checkUsesColumn: (name, col) => err('ER_DEPENDENT_BY_CHECK_CONSTRAINT', 3959, `Check constraint '${name}' uses column '${col}', hence column cannot be dropped or renamed.`),
  unknownColumnIn: (name, table) => err('ER_BAD_FIELD_ERROR', 1054, `Unknown column '${name}' in '${table}'`, '42S22'),
};

// `db`.`child`, CONSTRAINT `fk` FOREIGN KEY (`a`) REFERENCES `parent` (`b`) — shared by 1451/1452
export const fkDetail = (dbName, childName, fk) =>
  `(${q(dbName)}.${q(childName)}, CONSTRAINT ${q(fk.name)} FOREIGN KEY (${fk.cols.map(q).join(', ')}) REFERENCES ${q(fk.refName)} (${fk.refCols.map(q).join(', ')})${fkActions(fk)})`;
// an omitted action is stored as NO ACTION (as in MySQL 8's data dictionary) and not printed
export const fkActions = (fk) =>
  (fk.onDelete !== 'NO ACTION' ? ` ON DELETE ${fk.onDelete}` : '') + (fk.onUpdate !== 'NO ACTION' ? ` ON UPDATE ${fk.onUpdate}` : '');
