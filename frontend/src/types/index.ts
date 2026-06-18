export type OperatorCategory =
  | 'scan' | 'filter' | 'project' | 'join'
  | 'aggregate' | 'sort' | 'limit' | 'set' | 'other';

export interface PlanNode {
  id:          string;
  name:        string;
  category:    OperatorCategory;
  table?:      string;
  extra:       Record<string, string | string[]>;
  children:    PlanNode[];
  est_rows:    number | null;
  actual_rows: number | null;
  time_ms:     number | null;
}

export interface Column {
  name: string;
  type: string;
}

export interface TableInfo {
  table:     string;
  row_count: number;
  columns:   Column[];
}

export interface SampleQuery {
  label: string;
  sql:   string;
}

export interface StmtResult {
  index:        number;    // 0-based statement index
  total:        number;    // total statements in batch
  kind:         'select' | 'ddl' | 'dml' | 'explain';
  sql_preview:  string;    // first 80 chars of statement
  columns:      string[];
  rows:         unknown[][];
  row_count:    number;
  affected:     number | null;  // for INSERT/UPDATE/DELETE
  elapsed_ms:   number;
  plan:         PlanNode | null;
  stats_plan:   PlanNode | null;
}

// WebSocket events from backend
export type WsEvent =
  | { type: 'schema';      tables: TableInfo[] }
  | { type: 'plan';        tree: PlanNode }
  | { type: 'progress';    rows_done: number; elapsed_ms: number }
  | { type: 'results';     columns: string[]; rows: unknown[][]; total: number; elapsed_ms: number }
  | { type: 'stats';       plan: PlanNode; elapsed_ms: number }
  | { type: 'ddl_result';  statement: string; kind: string; elapsed_ms: number; message: string }
  | { type: 'stmt_start';  index: number; total: number; kind: string; sql_preview: string }
  | { type: 'stmt_done';   result: StmtResult }
  | { type: 'reset_ok' }
  | { type: 'error';       message: string; line?: number; col?: number };

export type ExecStatus = 'idle' | 'planning' | 'running' | 'done' | 'error';

export interface ExecState {
  status:        ExecStatus;
  plan:          PlanNode | null;
  statsPlan:     PlanNode | null;
  columns:       string[];
  rows:          unknown[][];
  rowsDone:      number;
  totalRows:     number;
  elapsedMs:     number;
  error:         string | null;
  errorLine:     number | null;
  errorCol:      number | null;
  tables:        TableInfo[];
  stmtResults:   StmtResult[];   // for multi-statement batches
  activeStmt:    number;          // which stmt result to display
  ddlMessages:   string[];        // DDL/DML feedback lines
}
