// Code Quality Self-Check and Validation Module

export interface ValidationIssue {
  filePath: string;
  type: 'error' | 'warning';
  message: string;
}

export interface ValidationReport {
  isValid: boolean;
  passedChecksCount: number;
  totalFilesChecked: number;
  issues: ValidationIssue[];
  summary: string;
}

export function validateProjectCode(
  files: Record<string, string>,
  options: { skipBrokenLinkCheck?: boolean } = {}
): ValidationReport {
  const fileEntries = Object.entries(files);
  const issues: ValidationIssue[] = [];
  let passedChecksCount = 0;

  if (fileEntries.length === 0) {
    return {
      isValid: false,
      passedChecksCount: 0,
      totalFilesChecked: 0,
      issues: [{ filePath: 'project', type: 'error', message: 'Project has no files' }],
      summary: 'Validation failed: Project is empty.',
    };
  }

  for (const [filePath, content] of fileEntries) {
    if (!content || content.trim().length === 0) {
      issues.push({ filePath, type: 'error', message: 'File is empty' });
      continue;
    }

    passedChecksCount++; // Non-empty file check passed

    // Bracket balance check for TS/TSX/JS/JSX
    if (/\.(tsx|ts|jsx|js|json|css)$/i.test(filePath)) {
      const curlyOpen = (content.match(/\{/g) || []).length;
      const curlyClose = (content.match(/\}/g) || []).length;
      if (curlyOpen !== curlyClose) {
        issues.push({
          filePath,
          type: 'error',
          message: `Unbalanced curly braces: ${curlyOpen} '{' vs ${curlyClose} '}'`,
        });
      } else {
        passedChecksCount++;
      }

      const parenOpen = (content.match(/\(/g) || []).length;
      const parenClose = (content.match(/\)/g) || []).length;
      if (parenOpen !== parenClose) {
        issues.push({
          filePath,
          type: 'error',
          message: `Unbalanced parentheses: ${parenOpen} '(' vs ${parenClose} ')'`,
        });
      } else {
        passedChecksCount++;
      }
    }

    // JSX Check for .tsx / .jsx files
    if (/\.(tsx|jsx)$/i.test(filePath)) {
      if (content.includes('<') && content.includes('>')) {
        passedChecksCount++; // Basic JSX tag syntax passed
      }

      // Check for missing export default
      if (!content.includes('export default') && !content.includes('export {')) {
        issues.push({
          filePath,
          type: 'warning',
          message: 'Component file does not explicitly export a default or named component',
        });
      } else {
        passedChecksCount++;
      }

      // Check for 'use client' if hooks are present
      const usesHooks = /use(State|Effect|Context|Reducer|Ref|Memo|Callback)\s*\(/.test(content);
      if (usesHooks && !content.includes("'use client'") && !content.includes('"use client"')) {
        issues.push({
          filePath,
          type: 'warning',
          message: "React hooks detected, consider adding 'use client' directive at top of file",
        });
      } else {
        passedChecksCount++;
      }
    }

    // HTML & Component Link / Form / Button Validation (Self-QA)
    if (/\.(html|tsx|jsx)$/i.test(filePath)) {
      // 1. Link & Button Destination/Handler Checks
      const emptyHrefMatches = content.match(/<a\s+[^>]*href=["'](#|javascript:void\(0\)?|["']|\s*)["']/gi);
      if (emptyHrefMatches) {
        issues.push({
          filePath,
          type: 'warning',
          message: `Detected ${emptyHrefMatches.length} link(s) with empty/placeholder href="#"`,
        });
      } else {
        passedChecksCount++;
      }

      // Check for buttons without onClick or submit type
      const buttonMatches = content.match(/<button\b[^>]*>/gi) || [];
      for (const btn of buttonMatches) {
        if (!btn.toLowerCase().includes('onclick') && !btn.toLowerCase().includes('type="submit"') && !btn.toLowerCase().includes("type='submit'")) {
          issues.push({
            filePath,
            type: 'warning',
            message: `Found button missing explicitly defined onClick or type="submit" handler`,
          });
          break;
        }
      }

      // 2. Contact Form Verification
      if (content.toLowerCase().includes('<form')) {
        const hasSubmitEndpoint = content.includes('/api/forms/submit') || content.includes('fetch(') || content.includes('onSubmit') || content.includes('action=');
        const hasInputs = content.toLowerCase().includes('<input') || content.toLowerCase().includes('<textarea');

        if (!hasInputs) {
          issues.push({
            filePath,
            type: 'warning',
            message: 'Form element detected without input/textarea fields',
          });
        }
        if (!hasSubmitEndpoint) {
          issues.push({
            filePath,
            type: 'warning',
            message: 'Form element missing active submit handler or fetch integration to /api/forms/submit',
          });
        } else {
          passedChecksCount++;
        }
      }

      // 3. Multi-Page Broken Link Detection
      // Skipped mid-build for multi-page projects: earlier pages legitimately
      // link to sibling pages a later task hasn't generated yet. A final full
      // check runs once after all tasks in the plan have completed.
      if (!options.skipBrokenLinkCheck) {
        const internalHrefMatches = Array.from(content.matchAll(/href=["']([^"']+\.html)["']/gi));
        for (const match of internalHrefMatches) {
          const targetPage = match[1];
          if (!targetPage.startsWith('http') && !targetPage.startsWith('//') && !targetPage.startsWith('#')) {
            const cleanPage = targetPage.replace(/^\//, '');
            if (!files[cleanPage] && !files[targetPage]) {
              issues.push({
                filePath,
                type: 'error',
                message: `Broken internal link detected: href="${targetPage}" points to non-existent page file`,
              });
            } else {
              passedChecksCount++;
            }
          }
        }
      }
    }

    // HTML entry check
    if (filePath.endsWith('index.html')) {
      if (!content.toLowerCase().includes('<!doctype html>')) {
        issues.push({ filePath, type: 'warning', message: 'Missing <!DOCTYPE html> declaration' });
      } else {
        passedChecksCount++;
      }
      if (!content.includes('viewport')) {
        issues.push({ filePath, type: 'warning', message: 'Missing responsive meta viewport tag' });
      } else {
        passedChecksCount++;
      }
    }
  }

  const errors = issues.filter((i) => i.type === 'error');
  const isValid = errors.length === 0;

  return {
    isValid,
    passedChecksCount,
    totalFilesChecked: fileEntries.length,
    issues,
    summary: isValid
      ? `Validation passed: ${passedChecksCount} checks verified across ${fileEntries.length} files.`
      : `Validation found ${errors.length} error(s) across generated files.`,
  };
}
