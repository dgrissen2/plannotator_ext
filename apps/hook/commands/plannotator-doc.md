---
description: Review and annotate a markdown document with visual feedback
allowed-tools: Bash(plannotator:*), Read, Edit, MultiEdit, Write
argument-hint: <filepath>
---

## Document Review Workflow

!`plannotator doc $ARGUMENTS`

## Response Protocol

**If output says "LGTM - no changes needed":**
- Review complete. Summarize any changes made during the session and STOP.

**If output contains feedback:**
1. Apply ALL requested changes to the document
2. After changes complete, re-run: `plannotator doc $ARGUMENTS`
3. Wait for next review cycle

**MANDATORY**: After making ANY changes, you MUST re-run the command above.
Do NOT ask user if they want to review - just do it.
The cycle only ends on "LGTM".

**If feedback includes "Linked Documents" section with review requests:**
- After addressing the main document's feedback and getting "LGTM", run `/plannotator-doc` for each requested doc
- Process them one at a time, completing each before starting the next

### Annotation Types
- **DELETION**: Remove the marked text from the document
- **INSERTION**: Add new text at the indicated location
- **REPLACEMENT**: Replace the marked text with the suggested alternative
- **COMMENT**: Consider the feedback and revise the section as appropriate
