export type NavTab = 'chat' | 'home' | 'patients' | 'documents' | 'board' | 'settings';

export interface Patient {
  id: string;
  display_name: string;
  llm_alias: string;
  date_of_birth?: string;
  gender?: string;
  blood_group?: string;
  phone?: string;
  email?: string;
  status: 'active' | 'archived';
  created_at?: string;
  updated_at?: string;
}

export interface PatientArtifact {
  patient_id: string;
  summary: string;
  active_issues: string[];
  medications: string[];
  watch_for: string[];
  follow_ups: string[];
  notes: string;
  needs_review: number;
  schema_version: number;
  current_version: number;
  updated_at?: string;
}

export interface PatientArtifactVersion {
  id: string;
  version_num: number;
  author_type: 'doctor_manual' | 'proposal_approved';
  change_summary: string;
  created_at: string;
  artifact_snapshot: {
    summary: string;
    active_issues: string[];
    medications: string[];
    watch_for: string[];
    follow_ups: string[];
    notes: string;
  };
}

export interface DiffItem {
  item: string;
  status: 'added' | 'removed' | 'unchanged';
}

export interface ArtifactDiff {
  v1: number;
  v2: number;
  diff: {
    summary: { old: string; new: string; changed: boolean };
    notes: { old: string; new: string; changed: boolean };
    active_issues: DiffItem[];
    medications: DiffItem[];
    watch_for: DiffItem[];
    follow_ups: DiffItem[];
    has_changes: boolean;
  };
}

export interface LogEntryVersion {
  id: string;
  entry_id: string;
  previous_content: string;
  edited_at: string;
  edit_reason?: string;
}

export interface MedicalLogEntry {
  id: string;
  patient_id: string;
  entry_date: string;
  entry_type: 'observation' | 'vitals' | 'medication_change' | 'lab_note' | 'symptom' | string;
  content: string;
  metadata?: Record<string, any>;
  source: 'manual' | 'visit_close' | 'proposal_approved' | string;
  visit_id?: string | null;
  versions_count?: number;
  versions?: LogEntryVersion[];
  created_at?: string;
  updated_at?: string;
}

export interface CreateLogEntryPayload {
  entry_date?: string;
  entry_type: string;
  content: string;
  metadata?: Record<string, any>;
  source?: string;
  visit_id?: string;
}

export interface CreatePatientPayload {
  display_name: string;
  date_of_birth?: string;
  gender?: string;
  blood_group?: string;
  phone?: string;
  email?: string;
  initial_summary?: string;
}

export interface ApiKeyItem {
  id: string;
  provider: string;
  key_label: string;
  masked_key: string;
  is_active: number;
  priority: number;
  created_at?: string;
  total_calls?: number;
  successful_calls?: number;
  rate_limit_errors?: number;
  cooldown_until?: string | null;
  last_used_at?: string | null;
  last_error_message?: string | null;
}

export type UpdateStatus = 
  | 'idle' 
  | 'checking' 
  | 'available' 
  | 'not-available' 
  | 'downloading' 
  | 'downloaded' 
  | 'error' 
  | 'dev-mode';

export interface UpdateData {
  status: UpdateStatus;
  version?: string;
  releaseDate?: string;
  isPortable?: boolean;
  downloadUrl?: string | null;
  percent?: number;
  message?: string;
  error?: string;
}

export interface Project {
  id: number;
  name: string;
  description?: string;
  domain?: string;
  priority?: string;
  health?: string;
  owner?: string;
  target_date?: string;
  goals?: string;
  tech_stack?: string;
  status?: string;
  task_count?: number;
  done_task_count?: number;
  in_progress_task_count?: number;
  todo_task_count?: number;
  progress_pct?: number;
  outpost_provider?: string | null;
  outpost_project_key?: string | null;
  is_outpost_dictated?: number | boolean;
  last_synced_at?: string | null;
  color?: string;
  created_at?: string;
  updated_at?: string;
}

export interface CreateProjectPayload {
  name: string;
  domain?: string;
  priority?: string;
  health?: string;
  owner?: string;
  target_date?: string;
  goals?: string;
  tech_stack?: string;
  description?: string;
  seed_tasks?: boolean;
  initial_tasks?: Array<[string, string] | string>;
}

export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done' | string;
export type TaskPriority = 'low' | 'med' | 'high' | 'urgent';

export interface Task {
  id: number | string;
  project_id?: number;
  patient_id?: string;
  patient_alias?: string;
  patient_display_name?: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  ticket_type?: string;
  story_points?: number;
  acceptance_criteria?: string;
  assignee?: string;
  due_date?: string;
  due_time?: string;
  is_reminder?: number;
  position?: number;
  external_provider?: string | null;
  external_id?: string | null;
  external_url?: string | null;
  external_type?: string | null;
  external_labels?: string[] | string;
  sync_status?: string;
  last_synced_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Decision {
  id: number;
  project_id: number;
  title: string;
  rationale: string;
  impact?: string;
  created_at: string;
}

export interface KnowledgeDocument {
  id: number;
  project_id?: number | null;
  project_name?: string | null;
  filename: string;
  file_type: string;
  file_size?: number;
  chunk_count: number;
  word_count: number;
  status: string;
  created_at: string;
}

export interface DataSource {
  id: number;
  project_id: number;
  name: string;
  file_type: string;
  row_count: number;
  column_count: number;
  table_name: string;
  columns_json?: string;
  created_at: string;
}

export interface KPIWidget {
  id: number;
  project_id: number;
  data_source_id: number;
  title: string;
  widget_type: 'kpi_card' | 'bar_chart' | 'donut_chart' | 'table';
  operation: 'SUM' | 'AVG' | 'COUNT' | 'MIN' | 'MAX';
  target_column: string;
  group_by_column?: string;
  format_type: 'number' | 'currency' | 'percent';
  target_value?: number;
  position: number;
  created_at: string;
}

export type LLMProviderPref = 'auto' | 'ollama' | 'api';

export interface LLMTokenLimits {
  chat_max_tokens: number;
  file_gen_max_tokens: number;
  plan_max_tokens: number;
  tool_call_max_tokens: number;
}

export interface LLMStatus {
  active_provider: string;
  active_model: string;
  ollama: {
    available: boolean;
    models: string[];
    selected_model?: string;
    warning?: string;
  };
  api_configured: boolean;
  api_key_display?: string;
  api_base?: string;
  saved_model?: string;
  saved_provider_pref?: string;
  setup_required: boolean;
  token_limits?: LLMTokenLimits;
}

export interface LLMConfigPayload {
  provider: LLMProviderPref;
  api_key?: string;
  api_base?: string;
  model_name?: string;
  chat_max_tokens?: number;
  file_gen_max_tokens?: number;
  plan_max_tokens?: number;
  tool_call_max_tokens?: number;
}

export type TicketAccessScope = 'all' | 'internal_only' | 'external_only' | 'none';

export interface AITicketPolicy {
  access_scope: TicketAccessScope;
  creation_allowed: boolean;
}

export interface WorkspaceContext {
  policy: {
    access_scope: TicketAccessScope;
    creation_allowed: boolean;
    status: string;
  };
  target_project?: Project;
  projects: Project[];
  open_tickets: Task[];
  completed_tickets_count: number;
  docs: Array<{
    id: number;
    project_id?: number | null;
    filename: string;
    file_type: string;
    word_count: number;
    chunk_count: number;
    created_at: string;
  }>;
  matched_docs: Array<{
    id: number;
    filename: string;
    file_type: string;
  }>;
  datasets: Array<{
    id: number;
    name: string;
    file_type: string;
    row_count: number;
    column_count: number;
    table_name: string;
  }>;
  kpis: KPIWidget[];
}

export interface ActionProposal {
  action: string;
  title?: string;
  description?: string;
  priority?: string;
  status?: string;
  story_points?: number;
  ticket_type?: 'internal' | 'external';
  project_id?: number;
  assignee?: string;
  acceptance_criteria?: string;
  [key: string]: any;
}

export interface ClinicalProposal {
  id: string;
  patient_id: string;
  patient_alias?: string;
  visit_id?: string;
  proposal_type: 'artifact_update' | 'ticket' | 'log_entry' | 'reminder' | string;
  payload: Record<string, any>;
  diff?: Record<string, any>;
  rationale: string;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
  resolved_at?: string;
}

export interface ConsultationVisit {
  id: string;
  patient_id: string;
  visit_date: string;
  reason: string;
  doctor_notes?: string;
  outcome_summary?: string;
  status: 'open' | 'completed' | 'cancelled';
  created_at: string;
  closed_at?: string;
  patient_alias?: string;
  patient_display_name?: string;
  proposals?: ClinicalProposal[];
}

export interface CreateVisitPayload {
  patient_id: string;
  reason: string;
  doctor_notes?: string;
  appointment_id?: string;
}

export interface CloseVisitPayload {
  doctor_notes: string;
  outcome_summary?: string;
  vitals?: {
    bp?: string;
    hr?: string;
    temp?: string;
    o2?: string;
    [key: string]: any;
  };
}

export interface KeyPoolStatus {
  provider: string;
  total_keys: number;
  healthy_keys: number;
  cooldown_keys: number;
  all_in_cooldown: boolean;
  retry_countdown_seconds: number;
  keys: (ApiKeyItem & { in_cooldown?: boolean; cooldown_seconds_remaining?: number })[];
}

export type ArtifactDocType = 'prd' | 'rfc' | 'brief' | 'architecture' | 'notes' | 'breakdown' | 'document';

export interface Artifact {
  id: number;
  uuid: string;
  project_id?: number | null;
  title: string;
  doc_type: ArtifactDocType | string;
  content: string;
  summary?: string;
  tags: string[];
  is_pinned: boolean;
  word_count: number;
  external_provider?: string | null;
  external_id?: string | null;
  external_url?: string | null;
  sync_status?: string;
  last_synced_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface OutpostConfig {
  id?: number;
  provider: 'jira' | 'notion' | 'gdocs';
  base_url?: string;
  auth_token?: string;
  has_token?: boolean;
  user_email?: string;
  project_key?: string;
  database_id?: string;
  is_active: number | boolean;
  sync_policy: 'manual' | 'on_create';
  last_tested_at?: string;
  last_error?: string | null;
}

export interface BoardColumnSchema {
  id: string;
  name: string;
  status_category: string;
  order: number;
}

export interface DynamicBoardSchema {
  provider: 'local' | 'jira';
  columns: BoardColumnSchema[];
  allowed_types: string[];
  allowed_labels: string[];
  is_outpost_dictated: boolean;
}

export interface PreSyncSnapshot {
  filename: string;
  path: string;
  provider: string;
  task_count: number;
  created_at: string;
  file_size?: number;
}

export interface ArtifactVersion {
  id: number;
  artifact_id: number;
  version_num: number;
  title: string;
  summary?: string;
  created_at: string;
  byte_size?: number;
}

export interface ArtifactSummaryStats {
  total_count: number;
  prd_count: number;
  rfc_count: number;
  brief_count: number;
  pinned_count: number;
  total_words: number;
}

export interface CreateArtifactPayload {
  title: string;
  content?: string;
  doc_type?: string;
  project_id?: number | null;
  tags?: string[];
  summary?: string;
  is_pinned?: boolean;
}

export interface UpdateArtifactPayload {
  title?: string;
  content?: string;
  doc_type?: string;
  project_id?: number | null;
  tags?: string[];
  summary?: string;
  is_pinned?: boolean;
  create_version?: boolean;
  version_summary?: string;
}

export interface OnboardingConfig {
  projectName: string;
  domain: string;
  techStack: string;
  seedBacklog: boolean;
  provider: 'ollama' | 'gemini' | 'openai' | 'offline';
  ollamaModel?: string;
  apiKey?: string;
  apiBase?: string;
}


