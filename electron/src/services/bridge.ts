import type {
  Patient,
  CreatePatientPayload,
  ApiKeyItem,
  ArtifactDiff,
  MedicalLogEntry,
  CreateLogEntryPayload,
  Project,
  CreateProjectPayload,
  Task,
  Decision,
  KnowledgeDocument,
  DataSource,
  KPIWidget,
  UpdateData,
  LLMStatus,
  LLMConfigPayload,
  AITicketPolicy,
  WorkspaceContext,
  Artifact,
  ArtifactVersion,
  ArtifactSummaryStats,
  CreateArtifactPayload,
  UpdateArtifactPayload,
  OutpostConfig,
  DynamicBoardSchema,
  PreSyncSnapshot,
  ConsultationVisit,
  CreateVisitPayload,
  CloseVisitPayload,
  KeyPoolStatus,
} from '../types';

class BridgeService {
  private apiBase: string;
  private cachedToken: string | null = null;

  constructor() {
    this.apiBase = '';
  }

  public setBaseUrl(url: string) {
    this.apiBase = url.replace(/\/+$/, '');
  }

  public getBaseUrl(): string {
    return this.apiBase;
  }

  public async getAuthToken(): Promise<string | null> {
    if (this.cachedToken) return this.cachedToken;
    try {
      if (window.electronEnv?.getAuthToken) {
        this.cachedToken = await window.electronEnv.getAuthToken();
        return this.cachedToken;
      }
    } catch (_) {}
    return null;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.apiBase}${endpoint}`;
    const headers = new Headers(options.headers || {});

    if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const token = await this.getAuthToken();
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      try {
        const errorJson = await response.json();
        if (errorJson && (errorJson.error || errorJson.message)) {
          errorMessage = errorJson.error || errorJson.message;
        }
      } catch (_) {}
      throw new Error(errorMessage);
    }

    return response.json();
  }

  public streamClinicalChat(
    payload: { message: string; session_id?: string; patient_id?: string },
    callbacks: {
      onStart?: (sessionId: string) => void;
      onToken?: (token: string, sessionId: string) => void;
      onDone?: (fullText: string, sessionId: string) => void;
      onError?: (err: string) => void;
    }
  ): () => void {
    const controller = new AbortController();

    (async () => {
      try {
        const token = await this.getAuthToken();
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const res = await fetch(`${this.apiBase}/api/v1/chat/stream`, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errText = await res.text();
          let errMsg = `Request failed: ${res.status}`;
          try {
            const parsed = JSON.parse(errText);
            if (parsed.error) errMsg = parsed.error;
          } catch (_) {}
          callbacks.onError?.(errMsg);
          return;
        }

        const reader = res.body?.getReader();
        if (!reader) {
          callbacks.onError?.('Streaming not supported in this runtime.');
          return;
        }

        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let currentSessionId = payload.session_id || '';
        let accumulatedText = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const jsonStr = trimmed.slice(5).trim();
            if (!jsonStr) continue;

            try {
              const data = JSON.parse(jsonStr);
              if (data.error) {
                callbacks.onError?.(data.error);
                return;
              }
              if (data.event === 'start' && data.session_id) {
                currentSessionId = data.session_id;
                callbacks.onStart?.(data.session_id);
              } else if (data.event === 'token' && data.token) {
                accumulatedText += data.token;
                callbacks.onToken?.(data.token, data.session_id || currentSessionId);
              } else if (data.event === 'done') {
                const finalText = data.content !== undefined ? data.content : accumulatedText;
                callbacks.onDone?.(finalText, data.session_id || currentSessionId);
                return;
              }
            } catch (_) {
              // Ignore partial chunk parsing
            }
          }
        }

        callbacks.onDone?.(accumulatedText, currentSessionId);
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          callbacks.onError?.(err.message || 'Stream connection error');
        }
      }
    })();

    return () => {
      controller.abort();
    };
  }


  // ── Data API Plane ─────────────────────────────────────────────────────────
  public api = {
    ping: () => this.request<{ app: string; status: string }>('/api/ping'),
    getVersion: () => this.request<{ version: string; app_name: string; build_date: string }>('/api/version'),

    // Patients Directory (v1)
    listPatients: (params?: { query?: string; status?: string; limit?: number }) => {
      const q = new URLSearchParams();
      if (params?.query) q.set('query', params.query);
      if (params?.status) q.set('status', params.status);
      if (params?.limit) q.set('limit', String(params.limit));
      const qs = q.toString() ? `?${q.toString()}` : '';
      return this.request<{ patients: Patient[]; total: number }>(`/api/v1/patients${qs}`);
    },
    createPatient: (payload: CreatePatientPayload) =>
      this.request<{ patient: Patient }>('/api/v1/patients', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    getPatient: (id: string) => this.request<{ patient: Patient }>(`/api/v1/patients/${id}`),
    getPatientByAlias: (alias: string) => this.request<{ patient: Patient }>(`/api/v1/patients/by-alias/${alias}`),
    updatePatient: (id: string, updates: Partial<Patient>) =>
      this.request<{ patient: Patient }>(`/api/v1/patients/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      }),
    archivePatient: (id: string) =>
      this.request<{ success: boolean }>(`/api/v1/patients/${id}`, {
        method: 'DELETE',
      }),

    // Patient Context Artifacts & Versioning (Milestone 2)
    getPatientArtifact: (patientId: string) =>
      this.request<{ artifact: any }>(`/api/v1/patients/${patientId}/artifact`),
    updatePatientArtifact: (patientId: string, data: any) =>
      this.request<{ artifact: any }>(`/api/v1/patients/${patientId}/artifact`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    getPatientArtifactVersions: (patientId: string) =>
      this.request<{ versions: any[] }>(`/api/v1/patients/${patientId}/artifact/versions`),
    restorePatientArtifact: (patientId: string, versionNum: number) =>
      this.request<{ success: boolean; artifact: any; restored_version: number }>(
        `/api/v1/patients/${patientId}/artifact/restore/${versionNum}`,
        { method: 'POST' }
      ),
    getPatientArtifactDiff: (patientId: string, v1?: number, v2?: number) => {
      const q = new URLSearchParams();
      if (v1 !== undefined) q.set('v1', String(v1));
      if (v2 !== undefined) q.set('v2', String(v2));
      const qs = q.toString() ? `?${q.toString()}` : '';
      return this.request<ArtifactDiff>(`/api/v1/patients/${patientId}/artifact/diff${qs}`);
    },

    // Medical Log Entries (Milestone 2)
    listPatientLogs: (patientId: string, params?: { type?: string; limit?: number }) => {
      const q = new URLSearchParams();
      if (params?.type) q.set('type', params.type);
      if (params?.limit) q.set('limit', String(params.limit));
      const qs = q.toString() ? `?${q.toString()}` : '';
      return this.request<{ logs: MedicalLogEntry[]; count: number }>(
        `/api/v1/patients/${patientId}/logs${qs}`
      );
    },
    createPatientLog: (patientId: string, payload: CreateLogEntryPayload) =>
      this.request<{ log: MedicalLogEntry }>(`/api/v1/patients/${patientId}/logs`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    updatePatientLog: (entryId: string, updates: { content: string; edit_reason?: string; metadata?: any }) =>
      this.request<{ log: MedicalLogEntry }>(`/api/v1/logs/${entryId}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      }),
    deletePatientLog: (entryId: string) =>
      this.request<{ success: boolean; id: string }>(`/api/v1/logs/${entryId}`, {
        method: 'DELETE',
      }),

    // Multi-Key Gemini Management (v1)
    listKeys: () => this.request<{ keys: ApiKeyItem[] }>('/api/v1/keys'),
    addKey: (payload: { key_label: string; api_key: string; priority?: number }) =>
      this.request<{ key: ApiKeyItem }>('/api/v1/keys', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    deleteKey: (id: string) =>
      this.request<{ success: boolean }>(`/api/v1/keys/${id}`, {
        method: 'DELETE',
      }),
    getKeyPoolStatus: (provider: string = 'gemini') =>
      this.request<KeyPoolStatus>(`/api/v1/keys/status?provider=${encodeURIComponent(provider)}`),
    resetKeyCooldown: (keyId: string) =>
      this.request<{ success: boolean; key_id: string }>(`/api/v1/keys/${keyId}/reset-cooldown`, {
        method: 'POST',
      }),

    // Projects
    getProjects: (params?: { search?: string; status?: string; health?: string; domain?: string }) => {
      const q = new URLSearchParams();
      if (params?.search) q.set('search', params.search);
      if (params?.status) q.set('status', params.status);
      if (params?.health) q.set('health', params.health);
      if (params?.domain) q.set('domain', params.domain);
      const queryString = q.toString() ? `?${q.toString()}` : '';
      return this.request<{ projects: Project[]; count?: number }>(`/api/projects${queryString}`);
    },
    getProject: (id: number) => this.request<{ project: Project; tasks: Task[] }>(`/api/projects/${id}`),
    createProject: async (payload: string | CreateProjectPayload, description?: string): Promise<Project> => {
      const body = typeof payload === 'string' ? { name: payload, description } : payload;
      const res = await this.request<any>('/api/projects', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      return res.project || res;
    },
    updateProject: (id: number, patch: Partial<Project>) =>
      this.request<Project>(`/api/projects/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    deleteProject: (id: number) =>
      this.request<{ status: string; id: number }>(`/api/projects/${id}`, {
        method: 'DELETE',
      }),
    getProjectTasks: (id: number) =>
      this.request<{ tasks: Task[] }>(`/api/projects/${id}/tasks`),

    // Clinical Tickets (Milestone 4)
    listTickets: (params?: { patient_id?: string; status?: string }) => {
      const q = new URLSearchParams();
      if (params?.patient_id) q.set('patient_id', params.patient_id);
      if (params?.status) q.set('status', params.status);
      const qs = q.toString() ? `?${q.toString()}` : '';
      return this.request<{ tickets: any[]; count: number }>(`/api/v1/tickets${qs}`);
    },
    createTicket: (payload: {
      patient_id?: string;
      title: string;
      description?: string;
      priority?: string;
      status?: string;
      due_date?: string;
      due_time?: string;
      is_reminder?: number;
      visit_id?: string;
    }) =>
      this.request<{ ticket: any }>('/api/v1/tickets', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    getTicket: (id: string) => this.request<{ ticket: any }>(`/api/v1/tickets/${id}`),
    updateTicket: (id: string, updates: Record<string, any>) =>
      this.request<{ ticket: any }>(`/api/v1/tickets/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      }),
    deleteTicket: (id: string) =>
      this.request<{ status: string; id: string }>(`/api/v1/tickets/${id}`, {
        method: 'DELETE',
      }),

    // Safety Gate & Proposal Queue (Milestone 4)
    listProposals: (params?: { patient_id?: string; status?: string }) => {
      const q = new URLSearchParams();
      if (params?.patient_id) q.set('patient_id', params.patient_id);
      if (params?.status) q.set('status', params.status);
      const qs = q.toString() ? `?${q.toString()}` : '';
      return this.request<{ proposals: any[]; count: number }>(`/api/v1/proposals${qs}`);
    },
    createProposal: (payload: {
      patient_id: string;
      proposal_type: string;
      payload: any;
      rationale: string;
      visit_id?: string;
      diff?: any;
    }) =>
      this.request<{ proposal: any }>('/api/v1/proposals', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    getProposal: (id: string) => this.request<{ proposal: any }>(`/api/v1/proposals/${id}`),
    acceptProposal: (id: string) =>
      this.request<{ success: boolean; proposal_id: string; status: string; result?: any }>(
        `/api/v1/proposals/${id}/accept`,
        { method: 'POST' }
      ),
    rejectProposal: (id: string, reason?: string) =>
      this.request<{ success: boolean; proposal_id: string; status: string }>(
        `/api/v1/proposals/${id}/reject`,
        {
          method: 'POST',
          body: JSON.stringify({ reason }),
        }
      ),

    // Consultation Visits & Auto-Proposal Lifecycle (Milestone 5)
    listVisits: (params?: { patient_id?: string; status?: string; limit?: number }) => {
      const q = new URLSearchParams();
      if (params?.patient_id) q.set('patient_id', params.patient_id);
      if (params?.status) q.set('status', params.status);
      if (params?.limit) q.set('limit', params.limit.toString());
      const qs = q.toString() ? `?${q.toString()}` : '';
      return this.request<{ visits: ConsultationVisit[]; count: number }>(`/api/v1/visits${qs}`);
    },
    createVisit: (payload: CreateVisitPayload) =>
      this.request<{ visit: ConsultationVisit }>('/api/v1/visits', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    getVisit: (id: string) => this.request<{ visit: ConsultationVisit }>(`/api/v1/visits/${id}`),
    updateVisit: (id: string, updates: Partial<ConsultationVisit>) =>
      this.request<{ visit: ConsultationVisit }>(`/api/v1/visits/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      }),
    closeVisit: (id: string, payload: CloseVisitPayload) =>
      this.request<{
        visit: ConsultationVisit;
        log_entry: MedicalLogEntry;
        proposals: any[];
      }>(`/api/v1/visits/${id}/close`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    // Tasks / Kanban Tickets
    getTasks: (projectId?: number, status?: string) => {
      const params = new URLSearchParams();
      if (projectId) params.set('project_id', projectId.toString());
      if (status) params.set('status', status);
      const query = params.toString() ? `?${params.toString()}` : '';
      return this.request<{ tasks: Task[] }>(`/api/tasks${query}`);
    },
    createTask: async (task: Partial<Task>): Promise<Task> => {
      const res = await this.request<any>('/api/tasks', {
        method: 'POST',
        body: JSON.stringify(task),
      });
      return res.task || res;
    },
    updateTask: async (id: number | string, patch: Partial<Task>): Promise<Task> => {
      const res = await this.request<any>(`/api/tasks/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      return res.task || res;
    },
    deleteTask: async (id: number | string): Promise<{ success: boolean; id: number }> => {
      const res = await this.request<any>(`/api/tasks/${id}`, {
        method: 'DELETE',
      });
      return { success: res.status === 'deleted' || res.success === true, id: res.id || id };
    },
    getTaskMetrics: (projectId?: number) => {
      const q = projectId ? `?project_id=${projectId}` : '';
      return this.request<any>(`/api/tasks/metrics${q}`);
    },
    decomposePRD: (payload: {
      project_id?: number;
      prd_text: string;
      target_persona?: string;
      story_count?: number;
      preview_only?: boolean;
    }) =>
      this.request<any>('/api/tools/breakdown', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    commitStories: (payload: { project_id?: number; stories: any[] }) =>
      this.request<any>('/api/tools/breakdown/commit', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    // Knowledge Base Documents
    getDocuments: (projectId?: number, fileType?: string) => {
      const params = new URLSearchParams();
      if (projectId) params.set('project_id', projectId.toString());
      if (fileType) params.set('file_type', fileType);
      const query = params.toString() ? `?${params.toString()}` : '';
      return this.request<{ documents: KnowledgeDocument[]; count: number; total_chunks: number }>(`/api/documents${query}`);
    },
    uploadDocument: (formData: FormData) =>
      this.request<{ success?: boolean; document?: KnowledgeDocument; chunks_count?: number; error?: string }>('/api/documents/upload', {
        method: 'POST',
        body: formData,
      }),
    deleteDocument: (id: number) =>
      this.request<{ status: string; id: number }>(`/api/documents/${id}`, {
        method: 'DELETE',
      }),
    getDocumentChunks: (id: number) =>
      this.request<{ document: KnowledgeDocument; chunks: any[]; count: number }>(`/api/documents/${id}/chunks`),
    queryDocuments: (query: string, projectId?: number, topK = 5) =>
      this.request<{ query: string; chunks: any[]; count: number }>('/api/documents/query', {
        method: 'POST',
        body: JSON.stringify({ query, project_id: projectId, top_k: topK }),
      }),

    // AI Copilot & Clinical Consultation Sessions
    createConversation: (title?: string, patientId?: string) =>
      this.request<{ conversation: any; session: any }>('/api/v1/chat/sessions', {
        method: 'POST',
        body: JSON.stringify({ title, patient_id: patientId }),
      }),
    createChatSession: (title?: string, patientId?: string) =>
      this.request<{ session: any; conversation: any }>('/api/v1/chat/sessions', {
        method: 'POST',
        body: JSON.stringify({ title, patient_id: patientId }),
      }),
    getConversations: (patientId?: string) => {
      const q = patientId ? `?patient_id=${encodeURIComponent(patientId)}` : '';
      return this.request<{ conversations: any[]; sessions: any[] }>(`/api/v1/chat/sessions${q}`);
    },
    listChatSessions: (patientId?: string) => {
      const q = patientId ? `?patient_id=${encodeURIComponent(patientId)}` : '';
      return this.request<{ sessions: any[] }>(`/api/v1/chat/sessions${q}`);
    },
    getConversation: (convId: string) =>
      this.request<{ conversation: any; session: any; messages: any[] }>(`/api/v1/chat/sessions/${convId}`),
    getChatSession: (sessionId: string) =>
      this.request<{ session: any; messages: any[] }>(`/api/v1/chat/sessions/${sessionId}`),
    deleteConversation: (convId: string) =>
      this.request<{ status: string; id: string }>(`/api/v1/chat/sessions/${convId}`, {
        method: 'DELETE',
      }),
    deleteChatSession: (sessionId: string) =>
      this.request<{ status: string; id: string }>(`/api/v1/chat/sessions/${sessionId}`, {
        method: 'DELETE',
      }),
    sendChatMessage: (payload: { message: string; conversation_id?: string; session_id?: string; patient_id?: string }) =>
      this.request<{
        response: string;
        provider?: string;
        model?: string;
        conversation_id: string;
        session_id: string;
        conversation_title: string;
        sources?: any[];
      }>('/api/v1/chat', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    streamChat: (
      payload: { message: string; session_id?: string; patient_id?: string },
      callbacks: {
        onStart?: (sessionId: string) => void;
        onToken?: (token: string, sessionId: string) => void;
        onDone?: (fullText: string, sessionId: string) => void;
        onError?: (err: string) => void;
      }
    ) => this.streamClinicalChat(payload, callbacks),

    // Practice Dashboard & Scheduling (Milestone 3)
    getDashboardStats: () =>
      this.request<{
        total_patients: number;
        today_appointments_count: number;
        unreviewed_artifacts_count: number;
        open_tickets_count: number;
        next_appointment?: { alias: string; time: string; reason?: string } | null;
      }>('/api/v1/dashboard/stats'),
    listAppointments: (dateStr?: string, patientId?: string) => {
      const params = new URLSearchParams();
      if (dateStr) params.set('date', dateStr);
      if (patientId) params.set('patient_id', patientId);
      const q = params.toString() ? `?${params.toString()}` : '';
      return this.request<{ appointments: any[] }>(`/api/v1/appointments${q}`);
    },
    createAppointment: (payload: {
      patient_id: string;
      scheduled_time: string;
      duration_minutes?: number;
      appointment_type?: string;
      reason?: string;
    }) =>
      this.request<{ appointment: any }>('/api/v1/appointments', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    updateAppointment: (appointmentId: string, updates: Record<string, any>) =>
      this.request<{ appointment: any }>(`/api/v1/appointments/${appointmentId}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      }),
    deleteAppointment: (appointmentId: string) =>
      this.request<{ status: string; id: string }>(`/api/v1/appointments/${appointmentId}`, {
        method: 'DELETE',
      }),

    // Data Studio & Analytics
    getDataSources: (projectId?: number) => {
      const q = projectId ? `?project_id=${projectId}` : '';
      return this.request<{ data_sources: DataSource[] }>(`/api/data/sources${q}`);
    },
    uploadDataSource: (formData: FormData) =>
      this.request<{ success: boolean; data_source: DataSource }>('/api/data/sources/upload', {
        method: 'POST',
        body: formData,
      }),
    deleteDataSource: (id: number) =>
      this.request<{ status: string; id: number }>(`/api/data/sources/${id}`, {
        method: 'DELETE',
      }),
    getDataSourcePreview: (id: number, limit = 50) =>
      this.request<{ columns: string[]; rows: any[][]; row_count: number; total_rows: number }>(
        `/api/data/sources/${id}/preview?limit=${limit}`
      ),
    executeSafeSQL: (dataSourceId: number, sql: string, maxRows = 100) =>
      this.request<{
        success: boolean;
        columns: string[];
        rows: any[][];
        row_count: number;
        execution_time_ms: number;
        error?: string;
      }>('/api/data/query', {
        method: 'POST',
        body: JSON.stringify({ data_source_id: dataSourceId, query: sql, max_rows: maxRows }),
      }),
    getDashboards: (projectId?: number) => {
      const q = projectId ? `?project_id=${projectId}` : '';
      return this.request<{ dashboards: any[]; count: number }>(`/api/dashboards${q}`);
    },
    getDashboardDetail: (id: number) =>
      this.request<{ dashboard: any; widgets: any[] }>(`/api/dashboards/${id}`),
    createDashboard: (data: { title: string; description?: string; data_source_id?: number; project_id?: number }) =>
      this.request<any>('/api/dashboards', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    createWidget: (
      dashboardId: number,
      data: {
        title: string;
        data_source_id: number;
        widget_type?: string;
        metric_op?: string;
        value_column?: string;
        group_by_column?: string;
        format_type?: string;
        target_value?: number;
      }
    ) =>
      this.request<any>(`/api/dashboards/${dashboardId}/widgets`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    deleteWidget: (widgetId: number) =>
      this.request<{ status: string; id: number }>(`/api/dashboards/widgets/${widgetId}`, {
        method: 'DELETE',
      }),
    getWidgets: (projectId?: number) => {
      const q = projectId ? `?project_id=${projectId}` : '';
      return this.request<{ widgets: KPIWidget[] }>(`/api/data/widgets${q}`);
    },

    // Advanced Industry Analytics Engine (v2.1.0)
    getFunnelAnalysis: (payload: {
      source_id: number;
      stage_column: string;
      stages: string[];
      entity_column?: string;
    }) =>
      this.request<any>('/api/analytics/funnel', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    getCohortRetention: (payload: {
      source_id: number;
      user_column: string;
      date_column: string;
      period_type?: string;
      max_periods?: number;
    }) =>
      this.request<any>('/api/analytics/retention', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    getColumnStatistics: (payload: {
      source_id: number;
      column_name: string;
    }) =>
      this.request<any>('/api/analytics/statistics', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    getCorrelationMatrix: (payload: {
      source_id: number;
      columns?: string[];
    }) =>
      this.request<any>('/api/analytics/correlation', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    getTrendForecast: (payload: {
      source_id: number;
      date_column: string;
      metric_column: string;
      periods_ahead?: number;
      aggregation?: string;
    }) =>
      this.request<any>('/api/analytics/forecast', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    // Decisions
    getDecisions: (projectId?: number) => {
      const q = projectId ? `?project_id=${projectId}` : '';
      return this.request<{ decisions: Decision[] }>(`/api/decisions${q}`);
    },

    // LLM Gateway & Provider Configuration
    getLLMStatus: () => this.request<LLMStatus>('/api/llm/status'),

    saveLLMConfig: (payload: LLMConfigPayload) =>
      this.request<{ success?: boolean; error?: string; message?: string }>('/api/llm/config', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    probeOllama: () =>
      this.request<{
        available: boolean;
        models: string[];
        selected_model?: string;
        warning?: string;
      }>('/api/llm/ollama/probe'),

    getOllamaModels: () =>
      this.request<{
        available: boolean;
        models: string[];
        warning?: string;
      }>('/api/llm/ollama/models'),

    discoverGeminiModels: (apiKey?: string) =>
      this.request<{ models: string[]; count: number; error?: string }>('/api/llm/gemini/models', {
        method: 'POST',
        body: JSON.stringify({ api_key: apiKey }),
      }),

    probeCustomLLM: (url: string) =>
      this.request<{ ok: boolean; message: string; models?: string[]; error?: string }>('/api/llm/custom/probe', {
        method: 'POST',
        body: JSON.stringify({ url }),
      }),

    // Document Generation & Export
    exportDocx: async (
      title: string,
      content: string,
      metadata?: Record<string, string>
    ): Promise<Blob> => {
      const url = `${this.apiBase}/api/export/docx`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title || 'Product Document',
          content: content,
          metadata: metadata || {
            Author: 'PM Tool AI Copilot',
            Date: new Date().toISOString().slice(0, 10),
            Status: 'Draft Spec',
          },
        }),
      });
      if (!res.ok) throw new Error('Failed to generate DOCX document.');
      return res.blob();
    },

    exportMarkdown: async (title: string, content: string): Promise<Blob> => {
      const url = `${this.apiBase}/api/export/markdown`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title || 'Product Document',
          content: content,
        }),
      });
      if (!res.ok) throw new Error('Failed to generate Markdown document.');
      return res.blob();
    },

    saveDocumentToKnowledgeBase: async (
      title: string,
      content: string,
      projectId?: number
    ): Promise<any> => {
      const cleanTitle = title.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim() || 'Document';
      const file = new File([content], `${cleanTitle}.md`, { type: 'text/markdown' });
      const formData = new FormData();
      formData.append('file', file);
      if (projectId) {
        formData.append('project_id', projectId.toString());
      }
      return this.request<any>('/api/documents/upload', {
        method: 'POST',
        body: formData,
      });
    },

    summarizeDocument: (payload: {
      file_path?: string;
      doc_id?: number;
      output_path?: string;
      focus?: string;
      project_id?: number;
    }) =>
      this.request<any>('/api/documents/summarize', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    // ── Living Documents & Contextual Artifacts Studio Plane ────────────
    getArtifacts: (params?: {
      projectId?: number;
      docType?: string;
      search?: string;
      isPinned?: boolean;
    }) => {
      const q = new URLSearchParams();
      if (params?.projectId) q.set('project_id', params.projectId.toString());
      if (params?.docType && params.docType !== 'all') q.set('doc_type', params.docType);
      if (params?.search) q.set('search', params.search);
      if (params?.isPinned !== undefined) q.set('is_pinned', params.isPinned ? '1' : '0');
      const queryString = q.toString() ? `?${q.toString()}` : '';
      return this.request<{
        artifacts: Artifact[];
        count: number;
        stats: ArtifactSummaryStats;
      }>(`/api/artifacts${queryString}`);
    },

    getArtifact: (id: number) =>
      this.request<{ artifact: Artifact; success: boolean }>(`/api/artifacts/${id}`),

    createArtifact: (payload: CreateArtifactPayload) =>
      this.request<{ artifact: Artifact; success: boolean }>('/api/artifacts', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    updateArtifact: (id: number, payload: UpdateArtifactPayload) =>
      this.request<{ artifact: Artifact; success: boolean }>(`/api/artifacts/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),

    deleteArtifact: (id: number) =>
      this.request<{ success: boolean; id: number }>(`/api/artifacts/${id}`, {
        method: 'DELETE',
      }),

    togglePinArtifact: (id: number) =>
      this.request<{ artifact: Artifact; is_pinned: boolean; success: boolean }>(
        `/api/artifacts/${id}/pin`,
        { method: 'POST' }
      ),

    getArtifactVersions: (id: number) =>
      this.request<{ versions: ArtifactVersion[]; count: number; success: boolean }>(
        `/api/artifacts/${id}/versions`
      ),

    restoreArtifactVersion: (id: number, versionNum: number) =>
      this.request<{ artifact: Artifact; restored_version: number; success: boolean }>(
        `/api/artifacts/${id}/versions/restore`,
        {
          method: 'POST',
          body: JSON.stringify({ version_num: versionNum }),
        }
      ),

    saveArtifactFromChat: (payload: {
      content: string;
      title?: string;
      doc_type?: string;
      project_id?: number;
    }) =>
      this.request<{ artifact: Artifact; success: boolean; message: string }>(
        '/api/artifacts/from-chat',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      ),

    exportArtifactFile: async (id: number, format: 'docx' | 'markdown' | 'html'): Promise<Blob> => {
      const url = `${this.apiBase}/api/artifacts/${id}/export/${format}`;
      const res = await fetch(url, { method: 'POST' });
      if (!res.ok) throw new Error(`Failed to export artifact as ${format.toUpperCase()}`);
      return res.blob();
    },

    // ── Workspace Context & AI Policy Plane ─────────────────────────────
    getWorkspaceContext: (params?: { projectId?: number; query?: string }) => {
      const q = new URLSearchParams();
      if (params?.projectId) q.set('project_id', params.projectId.toString());
      if (params?.query) q.set('q', params.query);
      const queryString = q.toString() ? `?${q.toString()}` : '';
      return this.request<WorkspaceContext>(`/api/workspace/context${queryString}`);
    },

    getAIPolicies: () => this.request<AITicketPolicy>('/api/settings/ai-policies'),

    updateAIPolicies: (policy: Partial<AITicketPolicy>) =>
      this.request<AITicketPolicy>('/api/settings/ai-policies', {
        method: 'POST',
        body: JSON.stringify(policy),
      }),

    // ── Action Execution Plane (1-Click Apply) ───────────────────────────
    executeAction: (
      action: string,
      params: Record<string, any>,
      conversationId?: string,
      actionKey?: string
    ) =>
      this.request<{
        success: boolean;
        action: string;
        action_key?: string;
        task?: Task;
        message: string;
      }>('/api/tools/execute_action', {
        method: 'POST',
        body: JSON.stringify({
          action,
          params,
          conversation_id: conversationId,
          action_key: actionKey,
        }),
      }),

    getAppliedActions: (conversationId?: string) => {
      const q = conversationId ? `?conversation_id=${encodeURIComponent(conversationId)}` : '';
      return this.request<{
        applied_actions: any[];
        applied_action_keys: string[];
      }>(`/api/tools/applied_actions${q}`);
    },

    downloadBlob: (blob: Blob, filename: string) => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    },

    // ── Connection Outposts Plane ──────────────────────────────────────────
    getOutposts: () => this.request<{ outposts: OutpostConfig[] }>('/api/outposts'),
    saveOutpost: (provider: string, payload: Partial<OutpostConfig>) =>
      this.request<{ outpost: OutpostConfig; success: boolean }>(`/api/outposts/${provider}`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    testOutpost: (provider: string, payload?: Partial<OutpostConfig>) =>
      this.request<{ provider: string; healthy: boolean; latency_ms: number; message: string; details?: any }>(
        `/api/outposts/${provider}/test`,
        {
          method: 'POST',
          body: JSON.stringify(payload || {}),
        }
      ),
    deleteOutpost: (provider: string) =>
      this.request<{ success: boolean }>(`/api/outposts/${provider}`, {
        method: 'DELETE',
      }),
    linkProjectOutpost: (projectId: number, payload: { provider: string; project_key?: string }) =>
      this.request<{ success: boolean; message: string; snapshot: any; sync_result?: any }>(
        `/api/projects/${projectId}/link-outpost`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      ),
    unlinkProjectOutpost: (projectId: number) =>
      this.request<{ success: boolean; message: string }>(`/api/projects/${projectId}/unlink-outpost`, {
        method: 'POST',
      }),
    restoreProjectSnapshot: (projectId: number, snapshotPath?: string) =>
      this.request<{ success: boolean; restored_count: number }>(`/api/projects/${projectId}/restore-snapshot`, {
        method: 'POST',
        body: JSON.stringify({ snapshot_path: snapshotPath }),
      }),
    getProjectSnapshots: (projectId: number) =>
      this.request<{ snapshots: PreSyncSnapshot[] }>(`/api/projects/${projectId}/snapshots`),
    getBoardSchema: (projectId: number) =>
      this.request<DynamicBoardSchema>(`/api/projects/${projectId}/board-schema`),
    pushTaskToJira: (taskId: number) =>
      this.request<{ success: boolean; external_id?: string; external_url?: string }>(
        '/api/outposts/jira/push-task',
        {
          method: 'POST',
          body: JSON.stringify({ task_id: taskId }),
        }
      ),
    pushArtifactToNotion: (artifactId: number) =>
      this.request<{ success: boolean; external_id?: string; external_url?: string }>(
        '/api/outposts/notion/push-artifact',
        {
          method: 'POST',
          body: JSON.stringify({ artifact_id: artifactId }),
        }
      ),
    pushArtifactToGDocs: (artifactId: number) =>
      this.request<{ success: boolean; external_id?: string; external_url?: string }>(
        '/api/outposts/gdocs/push-artifact',
        {
          method: 'POST',
          body: JSON.stringify({ artifact_id: artifactId }),
        }
      ),
  };


  // ── Native OS Plane ────────────────────────────────────────────────────────
  public os = {
    isElectron: typeof window !== 'undefined' && Boolean(window.electronUpdater || window.electronEnv),
    
    checkForUpdates: () => {
      if (window.electronUpdater) {
        window.electronUpdater.checkForUpdates();
      }
    },

    restartAndInstallUpdate: () => {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('dc_just_updated_restart', 'true');
      }
      if (window.electronUpdater) {
        window.electronUpdater.restartAndInstall();
      }
    },

    onUpdateStatus: (callback: (data: UpdateData) => void) => {
      if (window.electronUpdater) {
        return window.electronUpdater.onStatus(callback);
      }
      return () => {};
    },

    getUpdaterInfo: async () => {
      if (window.electronUpdater) {
        return await window.electronUpdater.getInfo();
      }
      return { version: '0.4.0', isPackaged: false, isPortable: false };
    },

    notify: (title: string, body: string) => {
      if (window.electronNotifier) {
        window.electronNotifier.sendNotification({ title, body });
      } else if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body });
      }
    },
  };
}

export const AppBridge = new BridgeService();
export default AppBridge;
