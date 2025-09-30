/**
 * Conflict Guard - Prevents overlapping experiments
 */

import { createHash } from 'crypto';
import { normalizeUrlToPattern, urlOverlap } from '@shared/normalization/url';

export interface ActiveTarget {
  experimentId: string;
  urlPattern: string;           // e.g., "/products/*"
  targetKey?: string;          // sha256 of canonical selector
  roleKey?: string;            // "role:primary-cta"
  label: string;               // e.g., "primary-cta / Add to cart"
}

export interface CandidateTarget {
  url: string;
  selector?: string;
  role?: string;
}

/**
 * Generate SHA256 hash of a string
 */
export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Canonicalize a CSS selector for consistent comparison
 * - Normalize whitespace
 * - Lowercase tag names
 * - Sort class names
 */
export function canonicalizeSelector(selector: string): string {
  if (!selector) return '';

  return selector
    .trim()
    .replace(/\s+/g, ' ')
    // Lowercase HTML tag names
    .replace(/(^|[\s>+~])([A-Z][A-Za-z0-9-]*)/g, (_, prefix, tag) =>
      prefix + tag.toLowerCase()
    )
    // Sort class names within each selector part
    .split(/(\s*[>+~,]\s*)/)
    .map(part => {
      if (part.match(/^[>+~,]$/)) return part;

      // Extract and sort classes
      const classMatch = part.match(/\.([\w-]+(?:\s*\.\s*[\w-]+)*)/);
      if (classMatch) {
        const classes = classMatch[1].split(/\s*\.\s*/).sort().join('.');
        return part.replace(/\.([\w-]+(?:\s*\.\s*[\w-]+)*)/, '.' + classes);
      }
      return part;
    })
    .join('');
}

/**
 * Generate target keys for comparison
 */
export function targetKeys(selector?: string, role?: string) {
  const targetKey = selector ? sha256(canonicalizeSelector(selector)) : undefined;
  const roleKey = role ? `role:${role.toLowerCase().trim()}` : undefined;
  return { targetKey, roleKey };
}

/**
 * Convert active targets to a reserved payload for LLM prompts
 */
export function toReservedPayload(
  contextUrl: string,
  active: ActiveTarget[],
  maxItems: number = 10
) {
  const scope = normalizeUrlToPattern(contextUrl);

  const reserved = active
    .filter(t => urlOverlap(scope, t.urlPattern))
    .slice(0, maxItems) // Keep token budget small
    .map(t => ({
      scope: t.urlPattern,
      role: t.roleKey?.replace(/^role:/, '') ?? null,
      selector_hint: t.targetKey ? '[selector-protected]' : null,
      semantics: [t.label],
      experiment_id: t.experimentId
    }));

  return {
    context_url: contextUrl,
    context_pattern: scope,
    reserved_targets: reserved,
    rules: {
      strict: true,
      check_overlaps: true,
      prevent_indirect_changes: true
    }
  };
}

/**
 * Find conflicts between active experiments and a candidate
 */
export function findConflicts(
  active: ActiveTarget[],
  candidate: CandidateTarget
): ActiveTarget[] {
  const candidatePattern = normalizeUrlToPattern(candidate.url);
  const { targetKey, roleKey } = targetKeys(candidate.selector, candidate.role);

  return active.filter(target => {
    // First check URL overlap
    if (!urlOverlap(candidatePattern, target.urlPattern)) {
      return false;
    }

    // Then check target conflicts
    // Conflict if same selector hash
    if (targetKey && target.targetKey && targetKey === target.targetKey) {
      return true;
    }

    // Conflict if same role
    if (roleKey && target.roleKey && roleKey === target.roleKey) {
      return true;
    }

    // No conflict if different targets on overlapping URLs
    return false;
  });
}

/**
 * Check if a proposal might indirectly affect a reserved target
 * This is a heuristic check for things like:
 * - Parent/child relationships
 * - Adjacent elements that might shift
 * - Global styles that might cascade
 */
export function mightIndirectlyAffect(
  proposalSelector: string | undefined,
  reservedSelector: string | undefined
): boolean {
  if (!proposalSelector || !reservedSelector) {
    return false;
  }

  const proposal = proposalSelector.toLowerCase();
  const reserved = reservedSelector.toLowerCase();

  // Check if one is a parent/ancestor of the other
  if (proposal.includes(reserved) || reserved.includes(proposal)) {
    return true;
  }

  // Check for common parent selectors
  const getParentSelector = (sel: string) => {
    const parts = sel.split(/\s+/);
    return parts.slice(0, -1).join(' ');
  };

  const proposalParent = getParentSelector(proposal);
  const reservedParent = getParentSelector(reserved);

  if (proposalParent && reservedParent && proposalParent === reservedParent) {
    return true; // Same parent, might affect layout
  }

  // Check for body/html level changes that affect everything
  if (proposal.match(/^(body|html|:root)/)) {
    return true;
  }

  return false;
}

/**
 * Format conflict information for error messages
 */
export function formatConflictError(conflicts: ActiveTarget[]): string {
  if (conflicts.length === 0) {
    return 'No conflicts found';
  }

  const conflictList = conflicts
    .map(c => `  - Experiment ${c.experimentId}: ${c.label} on ${c.urlPattern}`)
    .join('\n');

  return `Conflicts detected with active experiments:\n${conflictList}`;
}

/**
 * Domain error class for conflict-related errors
 */
export class ConflictError extends Error {
  constructor(
    public code: string,
    public conflicts: ActiveTarget[],
    message?: string
  ) {
    super(message || formatConflictError(conflicts));
    this.name = 'ConflictError';
  }
}