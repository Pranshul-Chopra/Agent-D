import React, { useState, useEffect, useRef } from 'react';
import {
  FileText,
  Search,
  Plus,
  Pin,
  Trash2,
  Download,
  Share2,
  Clock,
  History,
  Check,
  ChevronDown,
  Sparkles,
  BookOpen,
  FolderKanban,
  ArrowLeft,
  Columns,
  Eye,
  Edit3,
  Bold,
  Italic,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  Table as TableIcon,
  Minus,
  Loader2,
  ExternalLink,
  Layers,
  Copy,
  AlertCircle,
  FileCheck,
} from 'lucide-react';
import type { Artifact, ArtifactVersion, ArtifactDocType, Project } from '../../types';
import AppBridge from '../../services/bridge';
import MarkdownContent from '../chat/MarkdownContent';

interface ArtifactsStudioProps {
  initialProjectId?: number | null;
  projects?: Project[];
  onOpenKnowledgeBase?: () => void;
}

const TEMPLATES: Record<string, { title: string; docType: ArtifactDocType; content: string; summary: string }> = {
  blank: {
    title: 'Untitled Document',
    docType: 'document',
    content: '# Untitled Document\n\nStart drafting your specification, technical RFC, or sprint brief here...\n',
    summary: 'Blank document canvas',
  },
  prd: {
    title: 'Product Requirement Document',
    docType: 'prd',
    content: `# Product Requirement Document: [Feature / Initiative Name]

## 1. Executive Summary & Problem Statement
*Describe the customer problem, market context, and why we are solving this right now.*

## 2. Goals & Success Metrics
- **Primary Goal**: Deliver a seamless user experience.
- **KPI 1**: Increase weekly active conversion by 15%.
- **KPI 2**: Sub-200ms p95 latency on core workflows.

## 3. User Personas & Target Audience
- **Primary Persona**: Platform Engineers / Agile Product Managers.
- **Pain Points**: Information fragmentation and context switching.

## 4. Functional Requirements
### 4.1 Core Capabilities
- [ ] Requirement 1: Interactive configuration and state persistence.
- [ ] Requirement 2: Real-time telemetry and validation checks.
- [ ] Requirement 3: Multi-format export with zero layout drift.

## 5. Non-Functional Requirements & Edge Cases
- **Security**: Local-first storage with encrypted credentials.
- **Reliability**: Graceful offline fallback on network loss.

## 6. Out of Scope (V1)
- Multi-region enterprise federation (deferred to future milestone).
`,
    summary: 'Standard enterprise Product Requirement Document',
  },
  rfc: {
    title: 'Architecture RFC: [System / Subsystem]',
    docType: 'rfc',
    content: `# Architecture RFC: [System / Subsystem Name]

**Author**: Engineering Team  
**Status**: Draft  
**Target Milestone**: v2.2.0  

---

## 1. Context & Motivation
*Detail the architectural challenges and architectural bottlenecks prompting this design.*

## 2. Proposed Architecture & System Design
*Describe the high-level components, responsibilities, and interaction contracts.*

\`\`\`text
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│ Client UI Plane │  ───> │ REST API Layer  │  ───> │ Dedicated DB    │
└─────────────────┘       └─────────────────┘       └─────────────────┘
\`\`\`

## 3. Database Schema & Data Contracts
- Segregated table structures ensuring high isolation.
- WAL journal mode with connection pooling.

## 4. Alternatives Considered
1. **Alternative A**: Monolithic single-table approach (rejected due to text bloat).
2. **Alternative B (Chosen)**: Dedicated segregated database architecture.

## 5. Security & Migration Strategy
- Step-by-step rollout plan with automated regression test suites.
`,
    summary: 'Technical architecture Request For Comments',
  },
  brief: {
    title: 'Sprint Brief: [Sprint Focus]',
    docType: 'brief',
    content: `# Sprint Brief: [Sprint Theme / Focus]

## 1. Sprint Objectives
*Define the single core deliverable that determines sprint success.*

## 2. High-Priority Work Items
- **Story 1**: Core schema implementation and migrations.
- **Story 2**: Frontend interactive workbench and studio controls.
- **Story 3**: End-to-end integration verification and load tests.

## 3. Dependencies & Risks
- **External Dependencies**: Stable LLM API access or local Ollama daemon.
- **Mitigation Strategy**: Standalone mock harness for offline testing.
`,
    summary: 'Agile sprint planning and focus brief',
  },
  notes: {
    title: 'Engineering Discovery Notes',
    docType: 'notes',
    content: `# Engineering Discovery Notes

**Date**: ${new Date().toISOString().slice(0, 10)}  
**Attendees**: Product Manager, Lead Architect  

## Key Discussion Points
- Identified customer bottlenecks in document discovery.
- Agreed on three-database architecture principle.

## Action Items
- [ ] Implement segregated database helper.
- [ ] Connect multi-format export pipeline.
`,
    summary: 'Discovery meeting notes and action items',
  },
};

const DOC_TYPE_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  prd: { label: 'PRD', color: '#e8a84c', bg: 'rgba(232, 168, 76, 0.1)', border: 'rgba(232, 168, 76, 0.3)' },
  rfc: { label: 'RFC', color: '#b388ff', bg: 'rgba(179, 136, 255, 0.1)', border: 'rgba(179, 136, 255, 0.3)' },
  brief: { label: 'Sprint Brief', color: '#4ade80', bg: 'rgba(74, 222, 128, 0.1)', border: 'rgba(74, 222, 128, 0.3)' },
  architecture: { label: 'Architecture', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.1)', border: 'rgba(56, 189, 248, 0.3)' },
  notes: { label: 'Notes', color: '#a1a1aa', bg: 'rgba(161, 161, 170, 0.1)', border: 'rgba(161, 161, 170, 0.3)' },
  breakdown: { label: 'Breakdown', color: '#f43f5e', bg: 'rgba(244, 63, 94, 0.1)', border: 'rgba(244, 63, 94, 0.3)' },
  document: { label: 'Document', color: '#d4d4d8', bg: 'rgba(212, 212, 216, 0.1)', border: 'rgba(212, 212, 216, 0.3)' },
};

export const ArtifactsStudio: React.FC<ArtifactsStudioProps> = ({
  initialProjectId,
  projects = [],
  onOpenKnowledgeBase,
}) => {
  // Navigation State
  const [viewMode, setViewMode] = useState<'gallery' | 'editor'>('gallery');
  const [editorMode, setEditorMode] = useState<'edit' | 'split' | 'preview'>('split');
  const [activeArtifact, setActiveArtifact] = useState<Artifact | null>(null);

  // Gallery Data
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterProjectId, setFilterProjectId] = useState<number | 'all'>(
    initialProjectId ? initialProjectId : 'all'
  );
  const [stats, setStats] = useState<any>({ total_count: 0, pinned_count: 0, total_words: 0 });

  // Editor State
  const [title, setTitle] = useState<string>('');
  const [content, setContent] = useState<string>('');
  const [docType, setDocType] = useState<string>('document');
  const [projectId, setProjectId] = useState<number | null>(null);
  const [isPinned, setIsPinned] = useState<boolean>(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'dirty'>('saved');

  // Modals & Drawers
  const [isTemplateMenuOpen, setIsTemplateMenuOpen] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [isVersionsDrawerOpen, setIsVersionsDrawerOpen] = useState(false);
  const [versions, setVersions] = useState<ArtifactVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [deleteConfirmDoc, setDeleteConfirmDoc] = useState<Artifact | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Sprint Decomposer Bridge
  const [isDecomposerOpen, setIsDecomposerOpen] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimeoutRef = useRef<any>(null);

  // Show auto-dismissing toast
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Fetch Artifacts
  const fetchArtifacts = async () => {
    setLoading(true);
    try {
      const pId = filterProjectId === 'all' ? undefined : filterProjectId;
      const res = await AppBridge.api.getArtifacts({
        projectId: pId,
        docType: filterType === 'all' ? undefined : filterType,
        search: searchQuery.trim() || undefined,
      });
      setArtifacts(res.artifacts || []);
      if (res.stats) setStats(res.stats);
    } catch (err: any) {
      console.error('Failed to load artifacts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchArtifacts();
  }, [filterProjectId, filterType, searchQuery]);

  // Load versions when drawer opens
  const fetchVersions = async (id: number) => {
    setLoadingVersions(true);
    try {
      const res = await AppBridge.api.getArtifactVersions(id);
      setVersions(res.versions || []);
    } catch (err) {
      console.error('Failed to load versions:', err);
    } finally {
      setLoadingVersions(false);
    }
  };

  // Autosave Debounce Logic
  const triggerAutosave = (newTitle: string, newContent: string, newType: string, newProjectId: number | null) => {
    if (!activeArtifact) return;
    setSaveStatus('saving');

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await AppBridge.api.updateArtifact(activeArtifact.id, {
          title: newTitle,
          content: newContent,
          doc_type: newType,
          project_id: newProjectId,
        });
        if (res && res.artifact) {
          setActiveArtifact(res.artifact);
          setSaveStatus('saved');
          // Update in local artifacts list
          setArtifacts((prev) => prev.map((a) => (a.id === res.artifact.id ? res.artifact : a)));
        }
      } catch (err) {
        console.error('Failed to autosave artifact:', err);
        setSaveStatus('dirty');
      }
    }, 600);
  };

  // Open Document in Editor
  const openEditor = (artifact: Artifact) => {
    setActiveArtifact(artifact);
    setTitle(artifact.title);
    setContent(artifact.content);
    setDocType(artifact.doc_type);
    setProjectId(artifact.project_id || null);
    setIsPinned(artifact.is_pinned);
    setSaveStatus('saved');
    setViewMode('editor');
  };

  // Create Document from Template
  const handleCreateDocument = async (templateKey: string) => {
    setIsTemplateMenuOpen(false);
    const tmpl = TEMPLATES[templateKey] || TEMPLATES.blank;
    try {
      const pId = filterProjectId === 'all' ? (projects[0]?.id || null) : filterProjectId;
      const res = await AppBridge.api.createArtifact({
        title: tmpl.title,
        content: tmpl.content,
        doc_type: tmpl.docType,
        summary: tmpl.summary,
        project_id: pId,
      });

      if (res && res.artifact) {
        showToast(`Created "${res.artifact.title}"`);
        fetchArtifacts();
        openEditor(res.artifact);
      }
    } catch (err: any) {
      showToast(`Error creating document: ${err.message}`);
    }
  };

  // Pin Toggle
  const handleTogglePin = async (e: React.MouseEvent, doc: Artifact) => {
    e.stopPropagation();
    try {
      const res = await AppBridge.api.togglePinArtifact(doc.id);
      if (res && res.artifact) {
        setArtifacts((prev) =>
          prev
            .map((a) => (a.id === doc.id ? { ...a, is_pinned: res.is_pinned } : a))
            .sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0))
        );
        if (activeArtifact && activeArtifact.id === doc.id) {
          setIsPinned(res.is_pinned);
        }
      }
    } catch (err) {
      console.error('Failed to toggle pin:', err);
    }
  };

  // Delete Document
  const handleDeleteConfirm = async () => {
    if (!deleteConfirmDoc) return;
    setDeleting(true);
    try {
      await AppBridge.api.deleteArtifact(deleteConfirmDoc.id);
      showToast(`Deleted "${deleteConfirmDoc.title}"`);
      setArtifacts((prev) => prev.filter((a) => a.id !== deleteConfirmDoc.id));
      if (activeArtifact && activeArtifact.id === deleteConfirmDoc.id) {
        setViewMode('gallery');
        setActiveArtifact(null);
      }
      setDeleteConfirmDoc(null);
    } catch (err: any) {
      showToast(`Failed to delete: ${err.message}`);
    } finally {
      setDeleting(false);
    }
  };

  // Snapshot Revision
  const handleCreateSnapshot = async () => {
    if (!activeArtifact) return;
    try {
      const res = await AppBridge.api.updateArtifact(activeArtifact.id, {
        title,
        content,
        create_version: true,
        version_summary: `Manual revision saved at ${new Date().toLocaleTimeString()}`,
      });
      if (res && res.artifact) {
        setActiveArtifact(res.artifact);
        showToast('Created historical snapshot');
        fetchVersions(activeArtifact.id);
      }
    } catch (err: any) {
      showToast(`Failed to save revision: ${err.message}`);
    }
  };

  // Restore Revision
  const handleRestoreVersion = async (vNum: number) => {
    if (!activeArtifact) return;
    try {
      const res = await AppBridge.api.restoreArtifactVersion(activeArtifact.id, vNum);
      if (res && res.artifact) {
        setActiveArtifact(res.artifact);
        setTitle(res.artifact.title);
        setContent(res.artifact.content);
        showToast(`Reverted to Version ${vNum}`);
        fetchVersions(activeArtifact.id);
        fetchArtifacts();
      }
    } catch (err: any) {
      showToast(`Failed to restore version: ${err.message}`);
    }
  };

  // Ingest to Knowledge Base (RAG)
  const handleIngestToKnowledgeBase = async () => {
    if (!activeArtifact) return;
    try {
      await AppBridge.api.saveDocumentToKnowledgeBase(
        title,
        content,
        projectId || undefined
      );
      showToast('Successfully indexed into Knowledge Base RAG!');
    } catch (err: any) {
      showToast(`Failed to index into Knowledge Base: ${err.message}`);
    }
  };

  // Export File
  const handleExport = async (format: 'docx' | 'markdown' | 'html') => {
    if (!activeArtifact) return;
    setIsExportMenuOpen(false);
    try {
      const blob = await AppBridge.api.exportArtifactFile(activeArtifact.id, format);
      const safeTitle = title.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim() || 'Document';
      const ext = format === 'docx' ? 'docx' : format === 'markdown' ? 'md' : 'html';
      AppBridge.api.downloadBlob(blob, `${safeTitle}.${ext}`);
      showToast(`Exported ${safeTitle}.${ext}`);
    } catch (err: any) {
      showToast(`Export failed: ${err.message}`);
    }
  };

  const handlePushNotion = async () => {
    if (!activeArtifact) return;
    setIsExportMenuOpen(false);
    try {
      showToast('Publishing living document to Notion...');
      const res = await AppBridge.api.pushArtifactToNotion(activeArtifact.id);
      if (res.success) {
        showToast('Document published to Notion workspace!');
      } else {
        showToast('Failed to publish to Notion.');
      }
    } catch (err: any) {
      showToast(`Notion error: ${err.message}`);
    }
  };

  const handlePushGDocs = async () => {
    if (!activeArtifact) return;
    setIsExportMenuOpen(false);
    try {
      showToast('Exporting to Google Docs...');
      const res = await AppBridge.api.pushArtifactToGDocs(activeArtifact.id);
      if (res.success) {
        showToast('Document exported to Google Docs!');
      } else {
        showToast('Failed to export to Google Docs.');
      }
    } catch (err: any) {
      showToast(`Google Docs error: ${err.message}`);
    }
  };

  // Textarea formatting helper
  const insertFormatting = (prefix: string, suffix: string = '', placeholder: string = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = content.slice(start, end);
    const replacement = selected ? `${prefix}${selected}${suffix}` : `${prefix}${placeholder}${suffix}`;

    const newContent = content.slice(0, start) + replacement + content.slice(end);
    setContent(newContent);
    triggerAutosave(title, newContent, docType, projectId);

    setTimeout(() => {
      textarea.focus();
      const cursorTarget = selected
        ? start + replacement.length
        : start + prefix.length + placeholder.length;
      textarea.setSelectionRange(cursorTarget, cursorTarget);
    }, 0);
  };

  // Calculate live stats
  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const charCount = content.length;

  return (
    <div className="h-full w-full flex flex-col overflow-hidden relative bg-[#111110] text-[#edeae4]">
      {/* Toast Feedback */}
      {toastMessage && (
        <div className="absolute top-4 right-6 z-50 flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#1c1c1b] border border-[#e8a84c]/40 text-xs text-[#edeae4] shadow-xl animate-fade-in font-mono">
          <Sparkles className="w-3.5 h-3.5 text-[#e8a84c]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODE A: GALLERY / CATALOG VIEW
      ───────────────────────────────────────────────────────────── */}
      {viewMode === 'gallery' && (
        <div className="h-full flex flex-col p-6 overflow-hidden space-y-5">
          {/* Top Header & Actions Strip */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#2e2c2a] flex-shrink-0">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold tracking-tight text-[#edeae4]">
                  Artifacts & Living Docs Studio
                </h2>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#e8a84c]/10 text-[#e8a84c] border border-[#e8a84c]/30 font-semibold">
                  artifacts.db
                </span>
              </div>
              <p className="text-xs text-[#9b9690] mt-0.5">
                Living product requirements, architecture RFCs, and sprint briefs with 1-click export and board synthesis.
              </p>
            </div>

            {/* Template Selector & New Document Button */}
            <div className="flex items-center gap-2 relative">
              {onOpenKnowledgeBase && (
                <button
                  onClick={onOpenKnowledgeBase}
                  className="px-3 py-1.5 rounded-lg border border-[#2e2c2a] hover:border-[#3e3c38] text-xs font-mono text-[#9b9690] hover:text-[#edeae4] transition-all flex items-center gap-1.5"
                >
                  <BookOpen className="w-3.5 h-3.5 text-[#e8a84c]" />
                  <span>Knowledge Base (RAG)</span>
                </button>
              )}

              <div className="relative">
                <button
                  onClick={() => setIsTemplateMenuOpen((prev) => !prev)}
                  className="px-3.5 py-1.5 rounded-lg bg-[#e8a84c] hover:bg-[#d4963d] text-black font-semibold text-xs transition-all shadow-sm flex items-center gap-1.5 font-mono"
                >
                  <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>New Document</span>
                  <ChevronDown className="w-3 h-3 ml-0.5" />
                </button>

                {isTemplateMenuOpen && (
                  <div className="absolute right-0 mt-1.5 w-60 rounded-xl bg-[#1c1c1b] border border-[#2e2c2a] shadow-2xl py-1 z-50 text-xs">
                    <div className="px-3 py-1.5 font-mono text-[10px] text-[#716d67] uppercase tracking-wider border-b border-[#2e2c2a]">
                      Select Starter Template
                    </div>
                    <button
                      onClick={() => handleCreateDocument('blank')}
                      className="w-full text-left px-3 py-2 hover:bg-[#252422] flex flex-col text-[#edeae4] transition-colors"
                    >
                      <span className="font-semibold text-xs">Blank Document</span>
                      <span className="text-[10px] text-[#716d67]">Start with an empty canvas</span>
                    </button>
                    <button
                      onClick={() => handleCreateDocument('prd')}
                      className="w-full text-left px-3 py-2 hover:bg-[#252422] flex flex-col text-[#edeae4] transition-colors"
                    >
                      <span className="font-semibold text-xs flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-[#e8a84c]" />
                        Product Requirement Doc (PRD)
                      </span>
                      <span className="text-[10px] text-[#716d67]">Problems, Personas, Scope, KPIs</span>
                    </button>
                    <button
                      onClick={() => handleCreateDocument('rfc')}
                      className="w-full text-left px-3 py-2 hover:bg-[#252422] flex flex-col text-[#edeae4] transition-colors"
                    >
                      <span className="font-semibold text-xs flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-[#b388ff]" />
                        Architecture RFC
                      </span>
                      <span className="text-[10px] text-[#716d67]">System design, schemas & alternatives</span>
                    </button>
                    <button
                      onClick={() => handleCreateDocument('brief')}
                      className="w-full text-left px-3 py-2 hover:bg-[#252422] flex flex-col text-[#edeae4] transition-colors"
                    >
                      <span className="font-semibold text-xs flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-[#4ade80]" />
                        Sprint Brief
                      </span>
                      <span className="text-[10px] text-[#716d67]">Milestone focus, scope & backlog links</span>
                    </button>
                    <button
                      onClick={() => handleCreateDocument('notes')}
                      className="w-full text-left px-3 py-2 hover:bg-[#252422] flex flex-col text-[#edeae4] transition-colors"
                    >
                      <span className="font-semibold text-xs flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-[#a1a1aa]" />
                        Discovery Notes
                      </span>
                      <span className="text-[10px] text-[#716d67]">Stakeholder findings & action items</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Filter Bar & Summary Counters */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 flex-shrink-0">
            {/* Search Input */}
            <div className="relative flex-1 max-w-sm">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[#716d67]" />
              <input
                type="text"
                placeholder="Search documents (FTS5 indexed)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-8 py-1.5 rounded-lg bg-[#161514] border border-[#2e2c2a] text-xs font-mono text-[#edeae4] placeholder-[#716d67] focus:outline-none focus:border-[#e8a84c] transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2.5 text-xs text-[#716d67] hover:text-[#edeae4]"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Doc Type Filter Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              {['all', 'prd', 'rfc', 'brief', 'architecture', 'notes'].map((t) => {
                const isActive = filterType === t;
                const label = t === 'all' ? 'All Docs' : (DOC_TYPE_META[t]?.label || t.toUpperCase());
                return (
                  <button
                    key={t}
                    onClick={() => setFilterType(t)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-mono transition-all whitespace-nowrap ${
                      isActive
                        ? 'bg-[#e8a84c]/20 text-[#e8a84c] border border-[#e8a84c]/50 font-semibold'
                        : 'bg-[#161514] text-[#9b9690] border border-[#2e2c2a] hover:border-[#3e3c38]'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Project Filter */}
            <select
              value={filterProjectId}
              onChange={(e) =>
                setFilterProjectId(e.target.value === 'all' ? 'all' : Number(e.target.value))
              }
              className="px-2.5 py-1.5 rounded-lg bg-[#161514] border border-[#2e2c2a] text-xs font-mono text-[#edeae4] focus:outline-none focus:border-[#e8a84c]"
            >
              <option value="all">All Projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Quick Stats Strip */}
          <div className="flex items-center gap-4 text-[11px] font-mono text-[#716d67] px-1">
            <span>
              Total Documents: <strong className="text-[#edeae4]">{stats.total_count || artifacts.length}</strong>
            </span>
            <span>•</span>
            <span>
              Pinned: <strong className="text-[#e8a84c]">{stats.pinned_count || 0}</strong>
            </span>
            <span>•</span>
            <span>
              Total Words: <strong className="text-[#edeae4]">{(stats.total_words || 0).toLocaleString()}</strong>
            </span>
          </div>

          {/* Document Cards Grid */}
          <div className="flex-1 overflow-y-auto min-h-0 pr-1">
            {loading ? (
              <div className="h-48 flex items-center justify-center gap-2 text-xs font-mono text-[#716d67]">
                <Loader2 className="w-4 h-4 animate-spin text-[#e8a84c]" />
                <span>Loading artifacts from artifacts.db...</span>
              </div>
            ) : artifacts.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center border border-dashed border-[#2e2c2a] rounded-xl p-8 text-center">
                <FileText className="w-10 h-10 text-[#716d67]/40 mb-3" />
                <h3 className="text-sm font-semibold text-[#edeae4]">No artifacts found</h3>
                <p className="text-xs text-[#716d67] mt-1 max-w-sm">
                  {searchQuery
                    ? `No living documents match "${searchQuery}".`
                    : 'Create your first living PRD, architecture RFC, or sprint brief using the New Document button.'}
                </p>
                <button
                  onClick={() => handleCreateDocument('prd')}
                  className="mt-4 px-3.5 py-1.5 rounded-lg bg-[#e8a84c]/20 hover:bg-[#e8a84c]/30 text-[#e8a84c] border border-[#e8a84c]/40 text-xs font-mono transition-colors"
                >
                  Create Product Requirement Document
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5 pb-6">
                {artifacts.map((doc) => {
                  const meta = DOC_TYPE_META[doc.doc_type] || DOC_TYPE_META.document;
                  const proj = projects.find((p) => p.id === doc.project_id);
                  const previewSnippet = doc.content
                    .replace(/^#+.*$/gm, '')
                    .replace(/[*_`#]/g, '')
                    .trim()
                    .slice(0, 140);

                  return (
                    <div
                      key={doc.id}
                      onClick={() => openEditor(doc)}
                      className={`group relative rounded-xl p-4 bg-[#161514] border transition-all cursor-pointer flex flex-col justify-between hover:bg-[#1a1918] ${
                        doc.is_pinned
                          ? 'border-[#e8a84c]/50 shadow-[0_0_12px_rgba(232,168,76,0.08)]'
                          : 'border-[#2e2c2a] hover:border-[#3e3c38]'
                      }`}
                    >
                      {/* Top Header: Badge & Actions */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <span
                          style={{ color: meta.color, backgroundColor: meta.bg, borderColor: meta.border }}
                          className="text-[10px] font-mono px-2 py-0.5 rounded border uppercase tracking-wider font-semibold"
                        >
                          {meta.label}
                        </span>

                        <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                          <button
                            title={doc.is_pinned ? 'Unpin' : 'Pin to top'}
                            onClick={(e) => handleTogglePin(e, doc)}
                            className={`p-1 rounded transition-colors ${
                              doc.is_pinned
                                ? 'text-[#e8a84c] bg-[#e8a84c]/10'
                                : 'text-[#716d67] hover:text-[#edeae4]'
                            }`}
                          >
                            <Pin className="w-3.5 h-3.5" />
                          </button>
                          <button
                            title="Delete document"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteConfirmDoc(doc);
                            }}
                            className="p-1 rounded text-[#716d67] hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Title */}
                      <h4 className="text-sm font-semibold text-[#edeae4] line-clamp-1 mb-1.5 group-hover:text-[#e8a84c] transition-colors">
                        {doc.title}
                      </h4>

                      {/* Content Preview */}
                      <p className="text-xs text-[#716d67] line-clamp-3 leading-relaxed flex-1 mb-3">
                        {previewSnippet || 'No content drafted yet...'}
                      </p>

                      {/* Footer Metadata */}
                      <div className="pt-2 border-t border-[#232220] flex items-center justify-between text-[10px] font-mono text-[#716d67]">
                        <div className="flex items-center gap-2">
                          <span>{doc.word_count || 0} words</span>
                          {proj && (
                            <>
                              <span>•</span>
                              <span className="truncate max-w-[90px] text-[#9b9690]">{proj.name}</span>
                            </>
                          )}
                        </div>
                        <span>
                          {new Date(doc.updated_at).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODE B: FULL LIVING DOCUMENT EDITOR (PranshulOS Style)
      ───────────────────────────────────────────────────────────── */}
      {viewMode === 'editor' && activeArtifact && (
        <div className="h-full flex flex-col overflow-hidden">
          {/* Editor Top Navigation & Action Strip */}
          <div className="h-13 px-4 border-b border-[#2e2c2a] bg-[#161514] flex items-center justify-between gap-3 flex-shrink-0">
            {/* Back to Gallery */}
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => {
                  fetchArtifacts();
                  setViewMode('gallery');
                }}
                className="px-2.5 py-1.5 rounded-lg border border-[#2e2c2a] hover:border-[#3e3c38] text-xs font-mono text-[#9b9690] hover:text-[#edeae4] flex items-center gap-1.5 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>All Docs</span>
              </button>

              {/* Title Input */}
              <input
                type="text"
                value={title}
                onChange={(e) => {
                  const val = e.target.value;
                  setTitle(val);
                  triggerAutosave(val, content, docType, projectId);
                }}
                placeholder="Document Title..."
                className="bg-transparent border-b border-transparent focus:border-[#e8a84c] text-sm font-semibold text-[#edeae4] px-1 py-0.5 outline-none w-64 md:w-80 truncate transition-colors"
              />

              {/* Doc Type Selector */}
              <select
                value={docType}
                onChange={(e) => {
                  const val = e.target.value;
                  setDocType(val);
                  triggerAutosave(title, content, val, projectId);
                }}
                className="bg-[#1c1c1b] border border-[#2e2c2a] text-[11px] font-mono text-[#edeae4] rounded px-2 py-1 outline-none focus:border-[#e8a84c]"
              >
                <option value="prd">PRD</option>
                <option value="rfc">RFC</option>
                <option value="brief">Sprint Brief</option>
                <option value="architecture">Architecture</option>
                <option value="notes">Notes</option>
                <option value="breakdown">Breakdown</option>
                <option value="document">General Doc</option>
              </select>

              {/* Project Selector */}
              <select
                value={projectId || ''}
                onChange={(e) => {
                  const val = e.target.value ? Number(e.target.value) : null;
                  setProjectId(val);
                  triggerAutosave(title, content, docType, val);
                }}
                className="hidden lg:block bg-[#1c1c1b] border border-[#2e2c2a] text-[11px] font-mono text-[#9b9690] rounded px-2 py-1 outline-none focus:border-[#e8a84c]"
              >
                <option value="">No Project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Right Action Controls */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Autosave Status */}
              <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-mono text-[#716d67] mr-1">
                {saveStatus === 'saving' ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin text-[#e8a84c]" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" />
                    <span>Saved</span>
                  </>
                )}
              </div>

              {/* Decompose to Sprint Kanban Bridge */}
              <button
                onClick={() => setIsDecomposerOpen(true)}
                className="px-2.5 py-1.5 rounded-lg bg-[#e8a84c]/10 hover:bg-[#e8a84c]/20 border border-[#e8a84c]/40 text-[#e8a84c] text-xs font-mono font-semibold flex items-center gap-1.5 transition-colors"
                title="Synthesize into atomic user stories and commit to sprint board"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Decompose to Sprint</span>
              </button>

              {/* Ingest into RAG Knowledge Base */}
              <button
                onClick={handleIngestToKnowledgeBase}
                className="px-2.5 py-1.5 rounded-lg bg-[#1c1c1b] border border-[#2e2c2a] hover:border-[#3e3c38] text-xs font-mono text-[#9b9690] hover:text-[#edeae4] flex items-center gap-1.5 transition-colors"
                title="Index document into Knowledge Base RAG for Copilot citations"
              >
                <BookOpen className="w-3.5 h-3.5 text-[#e8a84c]" />
                <span className="hidden lg:inline">Add to RAG</span>
              </button>

              {/* Versions Drawer Toggle */}
              <button
                onClick={() => {
                  setIsVersionsDrawerOpen((prev) => !prev);
                  if (!isVersionsDrawerOpen) fetchVersions(activeArtifact.id);
                }}
                className={`p-1.5 rounded-lg border text-xs font-mono transition-colors flex items-center gap-1 ${
                  isVersionsDrawerOpen
                    ? 'bg-[#e8a84c]/20 border-[#e8a84c] text-[#e8a84c]'
                    : 'bg-[#1c1c1b] border-[#2e2c2a] text-[#716d67] hover:text-[#edeae4]'
                }`}
                title="Revision History & Snapshots"
              >
                <History className="w-3.5 h-3.5" />
              </button>

              {/* Export Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setIsExportMenuOpen((prev) => !prev)}
                  className="px-2.5 py-1.5 rounded-lg bg-[#1c1c1b] border border-[#2e2c2a] hover:border-[#3e3c38] text-xs font-mono text-[#edeae4] flex items-center gap-1.5 transition-colors"
                >
                  <Download className="w-3.5 h-3.5 text-[#e8a84c]" />
                  <span>Export</span>
                  <ChevronDown className="w-3 h-3" />
                </button>

                {isExportMenuOpen && (
                  <div className="absolute right-0 mt-1.5 w-44 rounded-xl bg-[#1c1c1b] border border-[#2e2c2a] shadow-2xl py-1 z-50 text-xs font-mono">
                    <button
                      onClick={() => handleExport('docx')}
                      className="w-full text-left px-3 py-2 hover:bg-[#252422] text-[#edeae4] flex items-center gap-2"
                    >
                      <span className="w-2 h-2 rounded-full bg-blue-400" />
                      <span>Word (.docx)</span>
                    </button>
                    <button
                      onClick={() => handleExport('markdown')}
                      className="w-full text-left px-3 py-2 hover:bg-[#252422] text-[#edeae4] flex items-center gap-2"
                    >
                      <span className="w-2 h-2 rounded-full bg-[#e8a84c]" />
                      <span>Markdown (.md)</span>
                    </button>
                    <button
                      onClick={() => handleExport('html')}
                      className="w-full text-left px-3 py-2 hover:bg-[#252422] text-[#edeae4] flex items-center gap-2"
                    >
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      <span>HTML / Print</span>
                    </button>

                    <div className="my-1 border-t border-[#2e2c2a]" />

                    <button
                      onClick={handlePushNotion}
                      className="w-full text-left px-3 py-2 hover:bg-[#252422] text-[#edeae4] flex items-center gap-2"
                    >
                      <span className="w-2 h-2 rounded-full bg-white" />
                      <span>Publish to Notion</span>
                    </button>

                    <button
                      onClick={handlePushGDocs}
                      className="w-full text-left px-3 py-2 hover:bg-[#252422] text-[#edeae4] flex items-center gap-2"
                    >
                      <span className="w-2 h-2 rounded-full bg-[#4285f4]" />
                      <span>Export to Google Docs</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Secondary Formatting Toolbar & Segmented Mode Switcher */}
          <div className="h-10 px-4 border-b border-[#2e2c2a] bg-[#141413] flex items-center justify-between gap-2 flex-shrink-0 overflow-x-auto select-none">
            {/* Formatting Buttons */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => insertFormatting('**', '**', 'bold text')}
                className="p-1 rounded text-[#716d67] hover:text-[#edeae4] hover:bg-[#252422] transition-colors"
                title="Bold"
              >
                <Bold className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => insertFormatting('*', '*', 'italic text')}
                className="p-1 rounded text-[#716d67] hover:text-[#edeae4] hover:bg-[#252422] transition-colors"
                title="Italic"
              >
                <Italic className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => insertFormatting('~~', '~~', 'strikethrough')}
                className="p-1 rounded text-[#716d67] hover:text-[#edeae4] hover:bg-[#252422] transition-colors"
                title="Strikethrough"
              >
                <Strikethrough className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => insertFormatting('`', '`', 'code')}
                className="p-1 rounded text-[#716d67] hover:text-[#edeae4] hover:bg-[#252422] transition-colors"
                title="Inline Code"
              >
                <Code className="w-3.5 h-3.5" />
              </button>

              <div className="w-[1px] h-3.5 bg-[#2e2c2a] mx-1" />

              <button
                onClick={() => insertFormatting('# ', '', 'Heading 1')}
                className="p-1 rounded text-[#716d67] hover:text-[#edeae4] hover:bg-[#252422] transition-colors"
                title="Heading 1"
              >
                <Heading1 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => insertFormatting('## ', '', 'Heading 2')}
                className="p-1 rounded text-[#716d67] hover:text-[#edeae4] hover:bg-[#252422] transition-colors"
                title="Heading 2"
              >
                <Heading2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => insertFormatting('### ', '', 'Heading 3')}
                className="p-1 rounded text-[#716d67] hover:text-[#edeae4] hover:bg-[#252422] transition-colors"
                title="Heading 3"
              >
                <Heading3 className="w-3.5 h-3.5" />
              </button>

              <div className="w-[1px] h-3.5 bg-[#2e2c2a] mx-1" />

              <button
                onClick={() => insertFormatting('- ', '', 'Bullet item')}
                className="p-1 rounded text-[#716d67] hover:text-[#edeae4] hover:bg-[#252422] transition-colors"
                title="Bullet List"
              >
                <List className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => insertFormatting('1. ', '', 'Numbered item')}
                className="p-1 rounded text-[#716d67] hover:text-[#edeae4] hover:bg-[#252422] transition-colors"
                title="Numbered List"
              >
                <ListOrdered className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => insertFormatting('- [ ] ', '', 'Task item')}
                className="p-1 rounded text-[#716d67] hover:text-[#edeae4] hover:bg-[#252422] transition-colors"
                title="Checklist Item"
              >
                <CheckSquare className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => insertFormatting('> ', '', 'Quoted block')}
                className="p-1 rounded text-[#716d67] hover:text-[#edeae4] hover:bg-[#252422] transition-colors"
                title="Blockquote"
              >
                <Quote className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() =>
                  insertFormatting(
                    '| Column 1 | Column 2 |\n| :--- | :--- |\n| Value 1 | Value 2 |\n',
                    '',
                    ''
                  )
                }
                className="p-1 rounded text-[#716d67] hover:text-[#edeae4] hover:bg-[#252422] transition-colors"
                title="Markdown Table"
              >
                <TableIcon className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Mode Switcher Segmented Control */}
            <div className="flex items-center gap-3">
              <div className="text-[11px] font-mono text-[#716d67] hidden md:block">
                <span>{wordCount} words</span>
                <span className="mx-1.5">•</span>
                <span>{charCount} chars</span>
              </div>

              <div className="flex items-center bg-[#1c1c1b] border border-[#2e2c2a] rounded-lg p-0.5 font-mono text-[11px]">
                <button
                  onClick={() => setEditorMode('edit')}
                  className={`px-2 py-1 rounded transition-colors flex items-center gap-1 ${
                    editorMode === 'edit'
                      ? 'bg-[#252422] text-[#e8a84c] font-semibold shadow-sm'
                      : 'text-[#716d67] hover:text-[#edeae4]'
                  }`}
                >
                  <Edit3 className="w-3 h-3" />
                  <span>Edit</span>
                </button>
                <button
                  onClick={() => setEditorMode('split')}
                  className={`px-2 py-1 rounded transition-colors flex items-center gap-1 ${
                    editorMode === 'split'
                      ? 'bg-[#252422] text-[#e8a84c] font-semibold shadow-sm'
                      : 'text-[#716d67] hover:text-[#edeae4]'
                  }`}
                >
                  <Columns className="w-3 h-3" />
                  <span>Split</span>
                </button>
                <button
                  onClick={() => setEditorMode('preview')}
                  className={`px-2 py-1 rounded transition-colors flex items-center gap-1 ${
                    editorMode === 'preview'
                      ? 'bg-[#252422] text-[#e8a84c] font-semibold shadow-sm'
                      : 'text-[#716d67] hover:text-[#edeae4]'
                  }`}
                >
                  <Eye className="w-3 h-3" />
                  <span>Preview</span>
                </button>
              </div>
            </div>
          </div>

          {/* Editor Workspace Container */}
          <div className="flex-1 flex overflow-hidden min-h-0 relative">
            {/* Left: Raw Markdown Editor Pane */}
            {(editorMode === 'edit' || editorMode === 'split') && (
              <div
                className={`h-full flex flex-col bg-[#111110] overflow-hidden ${
                  editorMode === 'split' ? 'w-1/2 border-r border-[#2e2c2a]' : 'w-full'
                }`}
              >
                <textarea
                  ref={textareaRef}
                  value={content}
                  onChange={(e) => {
                    const val = e.target.value;
                    setContent(val);
                    triggerAutosave(title, val, docType, projectId);
                  }}
                  placeholder="Draft your living document here..."
                  className="w-full h-full p-6 bg-transparent text-[#edeae4] font-mono text-xs leading-relaxed resize-none focus:outline-none custom-scroll placeholder-[#716d67]"
                  style={{ tabSize: 2 }}
                />
              </div>
            )}

            {/* Right: Rendered HTML / Markdown Preview Pane */}
            {(editorMode === 'preview' || editorMode === 'split') && (
              <div
                className={`h-full p-6 overflow-y-auto bg-[#131211] custom-scroll ${
                  editorMode === 'split' ? 'w-1/2' : 'w-full max-w-4xl mx-auto'
                }`}
              >
                <div className="prose prose-invert max-w-none text-xs leading-relaxed">
                  <MarkdownContent content={content || '*Document is currently empty...*'} />
                </div>
              </div>
            )}

            {/* Version History Drawer */}
            {isVersionsDrawerOpen && (
              <div className="absolute right-0 top-0 bottom-0 w-80 bg-[#161514] border-l border-[#2e2c2a] shadow-2xl flex flex-col z-30">
                <div className="p-3.5 border-b border-[#2e2c2a] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <History className="w-4 h-4 text-[#e8a84c]" />
                    <span className="text-xs font-semibold text-[#edeae4]">Revision History</span>
                  </div>
                  <button
                    onClick={() => setIsVersionsDrawerOpen(false)}
                    className="text-[#716d67] hover:text-[#edeae4] text-xs font-mono"
                  >
                    ✕
                  </button>
                </div>

                <div className="p-3 border-b border-[#2e2c2a] bg-[#1a1918]">
                  <button
                    onClick={handleCreateSnapshot}
                    className="w-full py-1.5 rounded-lg bg-[#e8a84c]/20 hover:bg-[#e8a84c]/30 text-[#e8a84c] border border-[#e8a84c]/40 text-xs font-mono font-semibold transition-colors"
                  >
                    + Snapshot Current State
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
                  {loadingVersions ? (
                    <div className="text-center py-6 text-xs font-mono text-[#716d67]">
                      Loading versions...
                    </div>
                  ) : versions.length === 0 ? (
                    <div className="text-center py-6 text-xs text-[#716d67]">
                      No historical snapshots recorded yet.
                    </div>
                  ) : (
                    versions.map((v) => (
                      <div
                        key={v.id}
                        className="p-3 rounded-lg bg-[#1c1c1b] border border-[#2e2c2a] text-xs flex flex-col gap-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-semibold text-[#e8a84c]">
                            v{v.version_num}
                          </span>
                          <span className="text-[10px] font-mono text-[#716d67]">
                            {new Date(v.created_at).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                        <p className="text-[#9b9690] text-[11px] line-clamp-2">
                          {v.summary || 'Revision snapshot'}
                        </p>
                        <button
                          onClick={() => handleRestoreVersion(v.version_num)}
                          className="mt-1 text-[11px] font-mono text-[#38bdf8] hover:underline self-start"
                        >
                          Revert to this version
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal (In-App Modal, zero alert()) */}
      {deleteConfirmDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-sm rounded-xl bg-[#161514] border border-[#2e2c2a] p-5 shadow-2xl flex flex-col gap-3">
            <div className="flex items-center gap-2.5 text-red-400">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <h3 className="font-semibold text-sm text-[#edeae4]">Delete Living Document?</h3>
            </div>
            <p className="text-xs text-[#9b9690] leading-relaxed">
              Are you sure you want to delete <strong className="text-[#edeae4]">"{deleteConfirmDoc.title}"</strong>?
              This will permanently remove the document and all historical versions from <code className="text-[#e8a84c]">artifacts.db</code>.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#2e2c2a]">
              <button
                disabled={deleting}
                onClick={() => setDeleteConfirmDoc(null)}
                className="px-3 py-1.5 rounded-lg border border-[#2e2c2a] hover:border-[#3e3c38] text-xs font-mono text-[#edeae4] transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={deleting}
                onClick={handleDeleteConfirm}
                className="px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold text-xs font-mono flex items-center gap-1.5 transition-colors"
              >
                {deleting && <Loader2 className="w-3 h-3 animate-spin" />}
                <span>Delete Document</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ArtifactsStudio;
