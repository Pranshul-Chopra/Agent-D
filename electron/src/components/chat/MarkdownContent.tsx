import React, { useState } from 'react';
import {
  Check,
  Copy,
  FileText,
  ExternalLink,
  ChevronRight,
  Sparkles,
  Bot,
  Layers,
  ArrowRight,
  Loader2,
} from 'lucide-react';

import ActionCard from './ActionCard';
import AppBridge from '../../services/bridge';

interface MarkdownContentProps {
  content: string;
  onPromptClick?: (prompt: string) => void;
  conversationId?: string;
  appliedActionKeys?: Set<string>;
  onActionApplied?: (task: any, actionKey: string) => void;
}

// ── Math & LaTeX Formatter ───────────────────────────────────────────────────

function formatLatex(tex: string): React.ReactNode {
  let s = tex.trim();

  // 1. Common Greek Letters
  const greek: Record<string, string> = {
    '\\alpha': 'α',
    '\\beta': 'β',
    '\\gamma': 'γ',
    '\\delta': 'δ',
    '\\epsilon': 'ε',
    '\\varepsilon': 'ε',
    '\\zeta': 'ζ',
    '\\eta': 'η',
    '\\theta': 'θ',
    '\\iota': 'ι',
    '\\kappa': 'κ',
    '\\lambda': 'λ',
    '\\mu': 'μ',
    '\\nu': 'ν',
    '\\xi': 'ξ',
    '\\pi': 'π',
    '\\rho': 'ρ',
    '\\sigma': 'σ',
    '\\tau': 'τ',
    '\\upsilon': 'υ',
    '\\phi': 'φ',
    '\\varphi': 'φ',
    '\\chi': 'χ',
    '\\psi': 'ψ',
    '\\omega': 'ω',
    '\\Gamma': 'Γ',
    '\\Delta': 'Δ',
    '\\Theta': 'Θ',
    '\\Lambda': 'Λ',
    '\\Xi': 'Ξ',
    '\\Pi': 'Π',
    '\\Sigma': 'Σ',
    '\\Phi': 'Φ',
    '\\Psi': 'Ψ',
    '\\Omega': 'Ω',
  };

  for (const [cmd, sym] of Object.entries(greek)) {
    s = s.split(cmd).join(sym);
  }

  // 2. Statistical operators and bars/hats
  s = s.replace(/\\bar\{([A-Za-z0-9])\}/g, '$1̄');
  s = s.replace(/\\hat\{([A-Za-z0-9α-ωΑ-Ω])\}/g, '$1̂');
  s = s.replace(/\\tilde\{([A-Za-z0-9])\}/g, '$1̃');
  s = s.replace(/\\vec\{([A-Za-z0-9])\}/g, '$1⃗');

  // Math words
  s = s.replace(/\\Var\b/g, 'Var');
  s = s.replace(/\\Cov\b/g, 'Cov');
  s = s.replace(/\\mathbb\{E\}/g, 'E');
  s = s.replace(/\\mathbb\{P\}/g, 'P');
  s = s.replace(/\\mathbb\{R\}/g, 'ℝ');
  s = s.replace(/\\text\{([^}]+)\}/g, '$1');
  s = s.replace(/\\sqrt\{([^}]+)\}/g, '√($1)');
  s = s.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1 / $2)');

  // Common operators
  s = s.replace(/\\le\b|\\leq\b/g, '≤');
  s = s.replace(/\\ge\b|\\geq\b/g, '≥');
  s = s.replace(/\\neq\b/g, '≠');
  s = s.replace(/\\approx\b/g, '≈');
  s = s.replace(/\\pm\b/g, '±');
  s = s.replace(/\\times\b/g, '×');
  s = s.replace(/\\cdot\b/g, '·');
  s = s.replace(/\\div\b/g, '÷');
  s = s.replace(/\\infty\b/g, '∞');
  s = s.replace(/\\to\b/g, '→');
  s = s.replace(/\\in\b/g, '∈');
  s = s.replace(/\\notin\b/g, '∉');
  s = s.replace(/\\sum\b/g, '∑');
  s = s.replace(/\\prod\b/g, '∏');

  // Superscript mapping
  const supers: Record<string, string> = {
    '0': '⁰',
    '1': '¹',
    '2': '²',
    '3': '³',
    '4': '⁴',
    '5': '⁵',
    '6': '⁶',
    '7': '⁷',
    '8': '⁸',
    '9': '⁹',
    '+': '⁺',
    '-': '⁻',
    '=': '⁼',
    '(': '⁽',
    ')': '⁾',
    'n': 'ⁿ',
    'i': 'ⁱ',
    'x': 'ˣ',
    'y': 'ʸ',
  };

  s = s.replace(/\^([0-9nixy\+\-\(\)])/g, (_, c) => supers[c] || `^${c}`);
  s = s.replace(/\^\{([0-9nixy\+\-\(\)]+)\}/g, (_, chars) =>
    chars.split('').map((c: string) => supers[c] || c).join('')
  );

  // Subscript mapping
  const subs: Record<string, string> = {
    '0': '₀',
    '1': '₁',
    '2': '₂',
    '3': '₃',
    '4': '₄',
    '5': '₅',
    '6': '₆',
    '7': '₇',
    '8': '₈',
    '9': '₉',
    '+': '₊',
    '-': '₋',
    '=': '₌',
    '(': '₍',
    ')': '₎',
    'a': 'ₐ',
    'e': 'ₑ',
    'i': 'ᵢ',
    'j': 'ⱼ',
    'k': 'ₖ',
    'l': 'ₗ',
    'm': 'ₘ',
    'n': 'ₙ',
    'o': 'ₒ',
    'p': 'ₚ',
    'r': 'ᵣ',
    's': 'ₛ',
    't': 'ₜ',
    'u': 'ᵤ',
    'v': 'ᵥ',
    'x': 'ₓ',
  };

  s = s.replace(/_([0-9aeijk-nx\+\-\(\)])/g, (_, c) => subs[c] || `_${c}`);
  s = s.replace(/_\{([0-9aeijk-nx\+\-\(\)]+)\}/g, (_, chars) =>
    chars.split('').map((c: string) => subs[c] || c).join('')
  );

  // Clean unescaped remaining braces
  s = s.replace(/[{}]/g, '');

  return s;
}

// ── Inline Markdown Renderer ─────────────────────────────────────────────────

export function renderInline(
  text: string,
  onPromptClick?: (prompt: string) => void
): React.ReactNode[] {
  if (!text) return [];

  try {
    // 1. Sanitize common LLM formatting artifacts
    // Normalize double backticks with space: ` `id` ` -> `id`
    let sanitizedText = text.replace(/`\s*`([^`]+)`\s*`/g, '`$1`');
    // Normalize backslash-escaped backticks: \`id\` -> `id`
    sanitizedText = sanitizedText.replace(/\\`([^`]+)\\`/g, '`$1`');
    // Normalize backslash-escaped bold: \*\*bold\*\* -> **bold**
    sanitizedText = sanitizedText.replace(/\\\*\\\*([^*]+)\\\*\\\*/g, '**$1**');

    // Split line by <br> or <br/> first to support multiline table cells and paragraphs
    const brSegments = sanitizedText.split(/(<br\s*\/?>)/gi);

    return brSegments.flatMap((segment, segIdx) => {
      if (/^<br\s*\/?>$/i.test(segment)) {
        return [<br key={`br-${segIdx}`} className="my-1" />];
      }

      // Tokenize segment safely with NON-CAPTURING inner groups
      const promptLinkPat = '\\[[^\\]]+\\]\\((?:prompt|suggest):[^)]+\\)';
      const promptBracketPat = '\\[(?:prompt|suggest):\\s*[^\\]]+\\]';
      const sourcePat = '\\[Source:\\s*[^\\]]+\\]';
      const mathPat = '\\$[^$\\n]+\\$';
      const codePat = '(?:``[^`\\n]+``|`[^`\\n]+`)';
      const boldPat = '(?:\\*\\*[^*\\n]+\\*\\*|__[^_\\n]+__)';
      const strikePat = '~~[^~\\n]+~~';
      const italicPat = '(?:\\*[^*\\n]+\\*|_[^_\\n]+_)';
      const linkPat = '\\[[^\\]]+\\]\\([^)]+\\)';

      const tokenRegex = new RegExp(
        `(${promptLinkPat}|${promptBracketPat}|${sourcePat}|${mathPat}|${codePat}|${boldPat}|${strikePat}|${italicPat}|${linkPat})`,
        'g'
      );

      const parts = segment.split(tokenRegex);

      return parts
        .filter((part): part is string => typeof part === 'string' && part.length > 0)
        .map((part, pIdx) => {
          if (!part) return null;
          const key = `${segIdx}-${pIdx}`;

          // 1. Interactive Prompt Suggestion [label](prompt:text)
          const promptLinkMatch = part.match(/^\[([^\]]+)\]\((?:prompt|suggest):([^)]+)\)$/);
          if (promptLinkMatch) {
            const label = promptLinkMatch[1].replace(/[*_`]/g, '').trim();
            const promptTarget = promptLinkMatch[2].trim();

            return (
              <button
                key={key}
                type="button"
                onClick={() => onPromptClick && onPromptClick(promptTarget)}
                className="inline-flex items-center gap-1.5 px-3 py-1 my-1 rounded-lg bg-[#222120] hover:bg-[#282725] border border-[#e8a84c]/30 hover:border-[#e8a84c] text-xs text-[#edeae4] transition-all cursor-pointer shadow-sm group font-medium"
                title={`Click to run: ${promptTarget}`}
              >
                <span className="text-[#e8a84c] group-hover:scale-110 transition-transform">⚡</span>
                <span>{label}</span>
                <span className="font-mono text-[10px] text-[#e8a84c] px-1 py-0.2 rounded bg-[#e8a84c]/10 border border-[#e8a84c]/20 ml-1">
                  ↵ send
                </span>
              </button>
            );
          }

          // 2. Bracketed prompt suggestion [prompt: /breakdown ...]
          const promptBracketMatch = part.match(/^\[(?:prompt|suggest):\s*([^\]]+)\]$/i);
          if (promptBracketMatch) {
            const promptTarget = promptBracketMatch[1].trim();
            return (
              <button
                key={key}
                type="button"
                onClick={() => onPromptClick && onPromptClick(promptTarget)}
                className="inline-flex items-center gap-1.5 px-3 py-1 my-1 rounded-lg bg-[#222120] hover:bg-[#282725] border border-[#4c97e8]/30 hover:border-[#4c97e8] text-xs text-[#edeae4] transition-all cursor-pointer shadow-sm group font-medium"
                title={`Click to run: ${promptTarget}`}
              >
                <Sparkles className="w-3.5 h-3.5 text-[#4c97e8] group-hover:scale-110 transition-transform" />
                <span>{promptTarget}</span>
                <span className="font-mono text-[10px] text-[#4c97e8] px-1 py-0.2 rounded bg-[#4c97e8]/10 border border-[#4c97e8]/20 ml-1">
                  ↵ send
                </span>
              </button>
            );
          }

          // 3. Document Source Badge [Source: MAS2001_Assignment3_1.pdf]
          const sourceMatch = part.match(/^\[Source:\s*([^\]]+)\]$/i);
          if (sourceMatch) {
            const srcName = sourceMatch[1].trim();
            return (
              <span
                key={key}
                className="inline-flex items-center gap-1 px-2 py-0.5 my-0.5 rounded-md bg-[#e8a84c]/10 text-[#e8a84c] border border-[#e8a84c]/25 text-[11px] font-mono select-text"
                title={`Grounded from indexed document: ${srcName}`}
              >
                <FileText className="w-3 h-3 text-[#e8a84c] flex-shrink-0" />
                <span className="truncate max-w-[200px]">{srcName}</span>
              </span>
            );
          }

          // 4. Inline Math ($ ... $)
          if (part.startsWith('$') && part.endsWith('$') && part.length > 2) {
            const mathContent = part.slice(1, -1);
            const formatted = formatLatex(mathContent);
            return (
              <span
                key={key}
                className="inline-flex items-center px-1.5 py-0.5 mx-0.5 rounded bg-[#1f1e1c] border border-[#2e2c2a] text-[#e8a84c] font-mono text-xs select-text tracking-wide shadow-inner"
              >
                {formatted}
              </span>
            );
          }

          // 5. Inline Code (` ... ` or `` ... ``)
          if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
            const rawCode = part.replace(/^`+|`+$/g, '').trim();
            return (
              <code
                key={key}
                className="px-1.5 py-0.5 rounded bg-[#111110] border border-[#2e2c2a] text-[#e8a84c] font-mono text-[11px]"
              >
                {rawCode}
              </code>
            );
          }

          // 6. Bold (** ... ** or __ ... __)
          if (
            (part.startsWith('**') && part.endsWith('**') && part.length >= 4) ||
            (part.startsWith('__') && part.endsWith('__') && part.length >= 4)
          ) {
            return (
              <strong key={key} className="font-bold text-[#edeae4]">
                {part.slice(2, -2)}
              </strong>
            );
          }

          // 7. Strikethrough (~~ ... ~~)
          if (part.startsWith('~~') && part.endsWith('~~') && part.length >= 4) {
            return (
              <del key={key} className="line-through text-[#78746f]">
                {part.slice(2, -2)}
              </del>
            );
          }

          // 8. Italics (* ... * or _ ... _)
          if (
            (part.startsWith('*') && part.endsWith('*') && part.length >= 2) ||
            (part.startsWith('_') && part.endsWith('_') && part.length >= 2)
          ) {
            return (
              <em key={key} className="italic text-[#d6d3cd]">
                {part.slice(1, -1)}
              </em>
            );
          }

          // 9. Safe Hyperlink [label](url)
          const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
          if (linkMatch) {
            const linkText = linkMatch[1];
            const linkUrl = linkMatch[2].trim();
            const isSafe = /^(?:https?:\/\/|mailto:)/i.test(linkUrl);

            if (isSafe) {
              return (
                <a
                  key={key}
                  href={linkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#e8a84c] hover:underline inline-flex items-center gap-0.5 font-medium"
                >
                  <span>{linkText}</span>
                  <ExternalLink className="w-2.5 h-2.5 opacity-70" />
                </a>
              );
            }
            return `${linkText} (${linkUrl})`;
          }

          return part;
        }).filter(Boolean);
    });
  } catch (err) {
    console.error('Error in renderInline:', err);
    return [text];
  }
}

// ── Code Block Item with Copy Button ─────────────────────────────────────────

const CodeBlock: React.FC<{ code: string; language: string }> = ({ code, language }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-3 rounded-lg overflow-hidden border border-[#2e2c2a] bg-[#111110] font-mono text-xs shadow-sm">
      <div className="px-3 py-1.5 bg-[#161514] border-b border-[#2e2c2a] flex items-center justify-between text-[11px] text-[#9b9690]">
        <span className="text-[#e8a84c] uppercase tracking-wider font-semibold font-mono">
          {language || 'code'}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 hover:text-[#edeae4] text-[#9b9690] transition-colors"
          title="Copy snippet"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-[#5aab7f]" />
              <span className="text-[#5aab7f]">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-3 overflow-x-auto text-[#edeae4] leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
};

// ── Markdown Table Component ─────────────────────────────────────────────────

const MarkdownTable: React.FC<{
  lines: string[];
  onPromptClick?: (prompt: string) => void;
}> = ({ lines, onPromptClick }) => {
  if (lines.length < 2) return null;

  const parseRow = (line: string): string[] => {
    let cells = line.trim().split('|');
    if (cells.length > 0 && cells[0].trim() === '') cells.shift();
    if (cells.length > 0 && cells[cells.length - 1].trim() === '') cells.pop();
    return cells.map((c) => c.trim());
  };

  const headerCells = parseRow(lines[0]);
  const separatorCells = parseRow(lines[1]);

  const alignments = separatorCells.map((cell) => {
    const trimmed = cell.trim();
    const left = trimmed.startsWith(':');
    const right = trimmed.endsWith(':');
    if (left && right) return 'text-center';
    if (right) return 'text-right';
    return 'text-left';
  });

  const dataRows: string[][] = [];
  for (let i = 2; i < lines.length; i++) {
    const row = parseRow(lines[i]);
    if (row.length === 0 || (row.length === 1 && !row[0])) continue;
    dataRows.push(row);
  }

  return (
    <div className="overflow-x-auto my-3 rounded-lg border border-[#2e2c2a] bg-[#161514] shadow-sm">
      <table className="w-full border-collapse text-xs">
        <thead className="bg-[#1f1e1c] border-b border-[#2e2c2a] text-[#e8a84c] font-mono text-[11px] uppercase tracking-wider">
          <tr>
            {headerCells.map((th, i) => (
              <th
                key={i}
                className={`px-3.5 py-2.5 font-semibold border-r border-[#2e2c2a] last:border-r-0 ${
                  alignments[i] || 'text-left'
                }`}
              >
                {renderInline(th, onPromptClick)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dataRows.map((row, rIdx) => (
            <tr
              key={rIdx}
              className="border-b border-[#2e2c2a] last:border-b-0 hover:bg-[#1a1918]/80 transition-colors odd:bg-[#161514] even:bg-[#141312]"
            >
              {headerCells.map((_, cIdx) => (
                <td
                  key={cIdx}
                  className={`px-3.5 py-2.5 leading-relaxed text-[#edeae4] border-r border-[#2e2c2a] last:border-r-0 align-top ${
                    alignments[cIdx] || 'text-left'
                  }`}
                >
                  {renderInline(row[cIdx] || '', onPromptClick)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ── Main Markdown Content Parser & Renderer ──────────────────────────────────

export const MarkdownContent: React.FC<MarkdownContentProps> = ({
  content,
  onPromptClick,
  conversationId,
  appliedActionKeys,
  onActionApplied,
}) => {
  if (!content) return null;

  const [localAppliedKeys, setLocalAppliedKeys] = useState<Set<string>>(new Set());
  const [isApplyingAll, setIsApplyingAll] = useState(false);
  const [applyAllProgress, setApplyAllProgress] = useState({ current: 0, total: 0 });

  const isKeyApplied = (key: string) => {
    return (appliedActionKeys && appliedActionKeys.has(key)) || localAppliedKeys.has(key);
  };

  try {
    const lines = content.split(/\r?\n/);

    // Pre-scan all action proposal blocks in this message
    const actionItems: { action: string; data: any; actionKey: string; lineIndex: number }[] = [];
    {
      let sIdx = 0;
      while (sIdx < lines.length) {
        const l = lines[sIdx];
        if (l.trim().startsWith('```')) {
          const langMatch = l.trim().match(/^```([a-zA-Z0-9_\-:]*)/);
          const language = (langMatch ? langMatch[1] : '').toLowerCase();
          const codeLines: string[] = [];
          const startLine = sIdx;
          sIdx++;
          while (sIdx < lines.length && !lines[sIdx].trim().startsWith('```')) {
            codeLines.push(lines[sIdx]);
            sIdx++;
          }
          sIdx++; // Skip closing ```
          const isActionTag =
            language.startsWith('action') ||
            language.startsWith('pm-action') ||
            language.startsWith('chibi-action');
          if (isActionTag || language === 'json') {
            try {
              const parsed = JSON.parse(codeLines.join('\n').trim());
              if (
                parsed &&
                typeof parsed === 'object' &&
                (isActionTag || parsed.action === 'create_ticket' || parsed.action === 'create_task')
              ) {
                const actionName = language.includes(':')
                  ? language.split(':')[1]
                  : parsed.action || 'create_ticket';
                const title = (parsed.title || parsed.subject || 'Untitled Story').trim();
                const actionKey =
                  parsed.action_key ||
                  `${conversationId || 'global'}:${actionName}:${title.toLowerCase()}`;
                actionItems.push({
                  action: actionName,
                  data: parsed,
                  actionKey,
                  lineIndex: startLine,
                });
              }
            } catch (_) {}
          }
        } else {
          sIdx++;
        }
      }
    }

    const pendingActions = actionItems.filter((item) => !isKeyApplied(item.actionKey));
    const hasMultipleActions = actionItems.length >= 2;

    const handleApplyAll = async () => {
      if (isApplyingAll || pendingActions.length === 0) return;
      setIsApplyingAll(true);
      setApplyAllProgress({ current: 0, total: pendingActions.length });

      for (let idx = 0; idx < pendingActions.length; idx++) {
        const item = pendingActions[idx];
        setApplyAllProgress({ current: idx + 1, total: pendingActions.length });
        try {
          const res = await AppBridge.api.executeAction(
            item.action,
            item.data,
            conversationId,
            item.actionKey
          );
          if (res.success && res.task) {
            setLocalAppliedKeys((prev) => new Set([...prev, item.actionKey]));
            if (onActionApplied) {
              onActionApplied(res.task, item.actionKey);
            }
          }
        } catch (err) {
          console.error('Failed to apply action in batch:', err);
        }
      }
      setIsApplyingAll(false);
    };

    const elements: React.ReactNode[] = [];
    let renderedApplyAllBar = false;
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // 1. Code Block (```) or Action Block (```action:...)
      if (line.trim().startsWith('```')) {
        const langMatch = line.trim().match(/^```([a-zA-Z0-9_\-:]*)/);
        const language = (langMatch ? langMatch[1] : '').toLowerCase();
        const codeLines: string[] = [];
        i++;
        while (i < lines.length && !lines[i].trim().startsWith('```')) {
          codeLines.push(lines[i]);
          i++;
        }
        i++; // Skip closing ```

        const codeRaw = codeLines.join('\n').trim();

        // Check if this is an action proposal block (e.g. action:create_ticket, action:create_task, chibi-action:...)
        const isActionTag =
          language.startsWith('action') ||
          language.startsWith('pm-action') ||
          language.startsWith('chibi-action');

        if (isActionTag || language === 'json') {
          try {
            const parsed = JSON.parse(codeRaw);
            if (
              parsed &&
              typeof parsed === 'object' &&
              (isActionTag || parsed.action === 'create_ticket' || parsed.action === 'create_task')
            ) {
              const actionName = language.includes(':')
                ? language.split(':')[1]
                : parsed.action || 'create_ticket';
              const title = (parsed.title || parsed.subject || 'Untitled Story').trim();
              const actionKey =
                parsed.action_key ||
                `${conversationId || 'global'}:${actionName}:${title.toLowerCase()}`;

              // Render Apply All bar if multiple action proposals exist in this message
              if (hasMultipleActions && !renderedApplyAllBar) {
                elements.push(
                  <div
                    key="apply-all-bar"
                    className="my-3 p-3 rounded-xl bg-gradient-to-r from-[#e8a84c]/10 via-[#1a1918] to-[#161514] border border-[#e8a84c]/30 flex items-center justify-between shadow-sm animate-fadeIn"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 rounded-lg bg-[#e8a84c]/20 text-[#e8a84c]">
                        <Layers className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-[#edeae4]">
                          ⚡ Batch Action Proposal: {actionItems.length} Sprint Tickets
                        </div>
                        <div className="text-[11px] text-[#9b9690]">
                          {pendingActions.length === 0
                            ? 'All proposals have been successfully applied to the Sprint Board.'
                            : `${pendingActions.length} of ${actionItems.length} tickets pending approval.`}
                        </div>
                      </div>
                    </div>

                    <div>
                      {pendingActions.length === 0 ? (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#5aab7f]/15 border border-[#5aab7f]/30 text-xs font-semibold text-[#5aab7f]">
                          <Check className="w-3.5 h-3.5" />
                          <span>All Applied ({actionItems.length})</span>
                        </div>
                      ) : (
                        <button
                          onClick={handleApplyAll}
                          disabled={isApplyingAll}
                          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#e8a84c] hover:bg-[#d4973b] disabled:opacity-50 text-black font-semibold text-xs shadow-sm transition-all cursor-pointer"
                        >
                          {isApplyingAll ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>
                                Applying ({applyAllProgress.current}/{applyAllProgress.total})...
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="font-bold">⚡</span>
                              <span>Apply All ({pendingActions.length} Tickets)</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
                renderedApplyAllBar = true;
              }

              elements.push(
                <ActionCard
                  key={`action-${i}`}
                  action={actionName}
                  data={parsed}
                  conversationId={conversationId}
                  actionKey={actionKey}
                  isAlreadyApplied={isKeyApplied(actionKey)}
                  onApplied={(task, key) => {
                    setLocalAppliedKeys((prev) => new Set([...prev, key]));
                    if (onActionApplied) {
                      onActionApplied(task, key);
                    }
                  }}
                />
              );
              continue;
            }
          } catch (_) {
            // Not valid JSON, fallback to standard code block
          }
        }

      elements.push(
        <CodeBlock
          key={`code-${i}`}
          language={language}
          code={codeLines.join('\n')}
        />
      );
      continue;
    }

    // 2. Display Math ($$ ... $$)
    if (line.trim().startsWith('$$')) {
      const mathLines: string[] = [];
      if (line.trim().endsWith('$$') && line.trim().length > 2) {
        mathLines.push(line.trim().slice(2, -2));
        i++;
      } else {
        i++;
        while (i < lines.length && !lines[i].trim().endsWith('$$')) {
          mathLines.push(lines[i]);
          i++;
        }
        i++;
      }
      elements.push(
        <div
          key={`disp-math-${i}`}
          className="my-3 p-3 overflow-x-auto text-center font-mono text-xs text-[#e8a84c] bg-[#161514] border border-[#2e2c2a] rounded-lg shadow-inner select-text"
        >
          {formatLatex(mathLines.join(' '))}
        </div>
      );
      continue;
    }

    // 3. Markdown Table (| ... |)
    // Check if current line starts with '|' and next line is a table divider '| --- |'
    if (
      line.trim().startsWith('|') &&
      i + 1 < lines.length &&
      lines[i + 1].trim().startsWith('|') &&
      lines[i + 1].includes('-') &&
      /^\|[\s|:\-]+\|$/.test(lines[i + 1].trim())
    ) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      elements.push(
        <MarkdownTable
          key={`table-${i}`}
          lines={tableLines}
          onPromptClick={onPromptClick}
        />
      );
      continue;
    }

    // 4. Horizontal Rule (---, ***, ___)
    if (/^(?:---|[*]{3}|___)\s*$/.test(line.trim())) {
      elements.push(<hr key={`hr-${i}`} className="my-4 border-[#2e2c2a]" />);
      i++;
      continue;
    }

    // 5. Headers (# ... #####)
    if (line.startsWith('##### ')) {
      elements.push(
        <h5 key={`h5-${i}`} className="text-xs font-bold text-[#edeae4] mt-3 mb-1">
          {renderInline(line.slice(6), onPromptClick)}
        </h5>
      );
      i++;
      continue;
    }
    if (line.startsWith('#### ')) {
      elements.push(
        <h4 key={`h4-${i}`} className="text-xs font-bold text-[#e8a84c] mt-3 mb-1">
          {renderInline(line.slice(5), onPromptClick)}
        </h4>
      );
      i++;
      continue;
    }
    if (line.startsWith('### ')) {
      const headerText = line.slice(4).trim();
      const isPhaseHeader =
        /Phase\s+\d+/i.test(headerText) ||
        headerText.includes('📌') ||
        headerText.includes('🚀') ||
        headerText.includes('⚡') ||
        /Milestone\s+\d+/i.test(headerText);

      if (isPhaseHeader) {
        elements.push(
          <div
            key={`phase-${i}`}
            className="my-3.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#e8a84c]/15 via-[#1a1918] to-[#161514] border-l-4 border-[#e8a84c] border-y border-r border-[#2e2c2a] flex items-center justify-between shadow-sm"
          >
            <h3 className="text-sm font-bold text-[#edeae4] tracking-wide flex items-center gap-2">
              {renderInline(headerText, onPromptClick)}
            </h3>
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#e8a84c] px-2 py-0.5 rounded bg-[#e8a84c]/10 border border-[#e8a84c]/20 flex-shrink-0">
              Roadmap Phase
            </span>
          </div>
        );
      } else {
        elements.push(
          <h3 key={`h3-${i}`} className="text-sm font-bold text-[#edeae4] mt-3 mb-1">
            {renderInline(headerText, onPromptClick)}
          </h3>
        );
      }
      i++;
      continue;
    }
    if (line.startsWith('## ')) {
      elements.push(
        <h2 key={`h2-${i}`} className="text-base font-bold text-[#e8a84c] mt-4 mb-1">
          {renderInline(line.slice(3), onPromptClick)}
        </h2>
      );
      i++;
      continue;
    }
    if (line.startsWith('# ')) {
      elements.push(
        <h1
          key={`h1-${i}`}
          className="text-lg font-bold text-[#edeae4] mt-4 mb-2 pb-1 border-b border-[#2e2c2a]"
        >
          {renderInline(line.slice(2), onPromptClick)}
        </h1>
      );
      i++;
      continue;
    }

    // 6. Blockquote (> ...)
    if (line.startsWith('> ')) {
      elements.push(
        <blockquote
          key={`quote-${i}`}
          className="border-l-2 border-[#e8a84c] pl-3 py-1 my-2 bg-[#222120]/50 rounded-r text-xs text-[#9b9690] italic"
        >
          {renderInline(line.slice(2), onPromptClick)}
        </blockquote>
      );
      i++;
      continue;
    }

    // 7. Task Checklists (- [ ] or - [x])
    const taskMatch = line.match(/^\s*-\s*\[([ xX])\]\s+(.*)$/);
    if (taskMatch) {
      const isDone = taskMatch[1].toLowerCase() === 'x';
      elements.push(
        <div key={`task-${i}`} className="flex items-center gap-2.5 my-1 ml-1 text-xs">
          <input
            type="checkbox"
            checked={isDone}
            readOnly
            className="w-3.5 h-3.5 rounded border-[#2e2c2a] text-[#5aab7f] focus:ring-0 cursor-default"
          />
          <span className={isDone ? 'line-through text-[#78746f]' : 'text-[#edeae4]'}>
            {renderInline(taskMatch[2], onPromptClick)}
          </span>
        </div>
      );
      i++;
      continue;
    }

    // 8. Bullet Lists (- or *)
    if (/^\s*[*•\-]\s+/.test(line)) {
      const contentText = line.replace(/^\s*[*•\-]\s+/, '');
      elements.push(
        <div key={`bullet-${i}`} className="flex items-start gap-2 ml-2 my-1 text-xs">
          <span className="text-[#e8a84c] mt-0.5 text-xs font-bold">•</span>
          <div className="flex-1 leading-relaxed text-[#edeae4]">
            {renderInline(contentText, onPromptClick)}
          </div>
        </div>
      );
      i++;
      continue;
    }

    // 9. Numbered Lists (1. , 2. )
    const olMatch = line.match(/^\s*(\d+)\.\s+(.*)$/);
    if (olMatch) {
      elements.push(
        <div key={`ol-${i}`} className="flex items-start gap-2 ml-2 my-1 text-xs">
          <span className="text-[#e8a84c] font-mono text-[11px] font-semibold mt-0.5">
            {olMatch[1]}.
          </span>
          <div className="flex-1 leading-relaxed text-[#edeae4]">
            {renderInline(olMatch[2], onPromptClick)}
          </div>
        </div>
      );
      i++;
      continue;
    }

    // 10. Standalone Prompt Action Button Line
    const promptActionMatch = line.trim().match(new RegExp('^\\' + '[([^\\]]+)\\]\\((?:prompt|suggest):([^)]+)\\)$'));
    if (promptActionMatch) {
      elements.push(
        <div key={`prompt-line-${i}`} className="my-2">
          {renderInline(line.trim(), onPromptClick)}
        </div>
      );
      i++;
      continue;
    }

    // 11. Empty lines
    if (!line.trim()) {
      elements.push(<div key={`empty-${i}`} className="h-2" />);
      i++;
      continue;
    }

    // 12. Standard Paragraph
    elements.push(
      <p key={`p-${i}`} className="my-1.5 leading-relaxed text-xs text-[#edeae4]">
        {renderInline(line, onPromptClick)}
      </p>
    );
    i++;
  }

  return <div className="space-y-0.5 text-xs leading-relaxed">{elements}</div>;
  } catch (err) {
    console.error('Failed to parse MarkdownContent:', err);
    return <div className="whitespace-pre-wrap text-xs text-[#edeae4] leading-relaxed">{content}</div>;
  }
};

export default MarkdownContent;
