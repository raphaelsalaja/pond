---
name: write
description: Write product copy in the Linear, Pond, and Family house style: short, declarative, present-tense, no em dashes, one sentence per description. Use when drafting or editing UI copy, settings descriptions, toast messages, button labels, empty states, marketing snippets, documentation leads, or any user-facing string. Triggers on /write or when the user asks to rewrite copy, tighten copy, make copy sound like Linear or Pond or Family, or asks for a copy review.
---

# /write: copywriting in the house style

## Quick start

Write copy the way Linear, Pond, and Family do. Short. Declarative. Present-tense. One sentence per description. No em dashes. Cut every word that isn't pulling weight. Walk the checklist at the end of this file before shipping any user-facing string.

If the user asked for a copy review, apply the principles below to each string they shared and return concrete before/after rewrites. If they asked you to draft new copy, lead with the verb or the subject and stop at one sentence unless a second sentence carries new information.

## Core principles

Each principle includes a typical agent or marketing draft (Before) and a house-style rewrite (After). Treat them as patterns, not strict rules.

### 1. One sentence per description

Lead with one declarative sentence. If a second sentence shows up, it must carry new information the first one does not.

Before:
"Releases lets you plan and track your software releases. With this feature, you can integrate with your CI/CD pipeline so that your team always knows what is deployed."

After:
"Plan and track your software releases directly from Linear."

### 2. No em dashes

Em dashes hide weak structure. Use a period, comma, colon, or two short sentences instead. To find them, scan for any horizontal dash wider than a hyphen and split the sentence at that point.

Before (one sentence joined by an em dash):
"Family Accounts use industry-standard encryption, em dash, only you can access your wallet."

After:
"Family Accounts use industry-standard encryption. Only you can access your wallet."

### 3. Present tense, active voice

Tell the reader what the product does now, not what it will do or has done.

Before:
"With Pond, you'll be able to save anything you find on the web."

After:
"Pond saves anything you find on the web."

### 4. Don't repeat the heading

Headings already say what the section is. Descriptions earn their place by adding new information.

Before:
Heading: "Notifications"
Description: "Notifications let you manage your notifications and stay up to date."

After:
Heading: "Notifications"
Description: "Manage how and when Linear pings you."

### 5. Drop hedging and filler

Words like "just", "simply", "actually", "really", and "of course" weaken every sentence they touch. Cut them.

Before:
"Just simply click the button to actually start your deploy."

After:
"Click Deploy to start."

### 6. Be specific. Name the thing.

"The experience" and "the platform" are placeholders. Name the noun, the number, or the action.

Before:
"The experience is faster on the new platform."

After:
"Pages load 40% faster on Fluid Compute."

### 7. Numbers stay numbers

Use digits for time, counts, sizes, and percentages, even when small.

Before:
"Connect your repo in five minutes."

After:
"Connect your repo in 5 minutes."

### 8. Sentence-case body, title-case page titles

Reserve title case for top-of-page titles and brand names. Item titles, settings labels, list rows, and descriptions are sentence-case.

Before:
"Two-Factor Authentication"
"Manage Your Connected Accounts"

After:
"Two-factor authentication"
"Manage your connected accounts"

> Writing for a Pond surface? Title Case applies to all headings and buttons — see "Pond-specific conventions" below.

### 9. Talk to the user as "you"

Never "the user". Use "you" when the action is the reader's. Use "we" sparingly, and only when the company is the actor.

Before:
"The user can configure two-factor authentication in their settings."

After:
"Configure two-factor authentication in your settings."

### 10. Concrete verbs, no metaphors

Avoid jokes, idioms, and metaphors. Lean on concrete verbs (send, save, build, deploy, connect, sync) over vague boosters (leverage, empower, unlock, supercharge).

Before:
"Supercharge your workflow and unlock the full power of Linear."

After:
"Plan and ship in one tool."

## Voice references

These three companies share the same backbone: short, declarative, concrete. They dial warmth differently. Match the dial to the surface you're writing for.

**Linear** is dry, technical, and exact. Marketing reads like documentation. Documentation reads like a careful colleague. Changelog entries are one-clause statements that often start with a verb.

> "Plan and track your software releases directly from Linear."

> "Linear helps teams plan, track, and deliver work without a lot of overhead."

**Pond** is technical and confident. Docs lead with what the thing does in present tense, then back it up with a how. Changelog entries name the change, then explain it in 1 to 2 short paragraphs.

> "Quick Capture saves any link, image, or note in one keystroke."

> "Sync is now on by default. Your library stays in step across every device signed into Pond."

**Family** is warm without getting longer. Pairs of short clauses give the writing rhythm. Verbs do the emotional work ("sweat", "explore", "delight"); sentences stay tight.

> "Your favorite crypto wallet."

> "Relentless protection. Restful ease."

> "Details that matter. We sweat the details, no matter how small."

## Pond-specific conventions

These rules apply **only when writing for a Pond surface** (product UI, docs, marketing). They reflect Pond's brand choices, not universal copy advice. When writing for Linear, Family, or a generic product, fall back to the core principles above.

### Casing

Headings and buttons use **Title Case (Chicago style)**. Marketing pages use sentence case.

| Surface | Casing |
| --- | --- |
| App headings, section titles, button labels, menu items | Title Case |
| Marketing page headings and body | Sentence case |
| Body copy, descriptions, helper text, tooltips | Sentence case |

Before:
"save api key" / "Configure your project"

After:
"Save API Key" / "Configure Your Project"

This overrides the Linear-leaning rule in core principle 8 when the target is a Pond surface.

### Use `&` over `and`

In headings, buttons, navigation, and short labels, prefer the ampersand. In body sentences, use `and`.

Before:
"Domains and Certificates"

After:
"Domains & Certificates"

### Action-oriented, second person

Lead with the verb. Tell the reader what to do. Never use first person ("I", "we", "our") in product UI; reserve "we" for billing or company-as-actor sentences in marketing.

Before:
"You will need to install the CLI before deploying."

After:
"Install the CLI to deploy."

### Keep nouns consistent

Introduce as few unique terms as possible. If a thing is called a "Project" in one place, it stays a "Project" everywhere — not "app", "site", or "repo" interchangeably. Pick the canonical noun and reuse it.

### Numbers and units

Use numerals for all counts, even small ones. Separate the number from its unit with a **non-breaking space** (`&nbsp;` in HTML/MDX, `\u00A0` in JS/TS strings).

Before:
"eight deployments" / "10MB" / "5 minutes"

After:
"8 deployments" / "10&nbsp;MB" / "5&nbsp;minutes"

### Currency

In any one context, use **either** 0 decimals **or** 2 decimals — never mix. `$20` and `$20.00` should not appear in the same table, page, or paragraph.

### Placeholders

Use these consistent placeholders in code samples, docs, and forms:

- Strings: `YOUR_API_TOKEN_HERE`, `YOUR_PROJECT_ID_HERE`, `YOUR_TEAM_SLUG_HERE`
- Numbers: `0123456789`
- Domains: `example.com`

### Positive framing

Frame messages around the path forward, not the failure. Errors still tell the truth — they just lead with the fix.

Before:
"Your deployment failed."

After:
"Something went wrong. Try again or contact support."

### Error messages guide the exit

Every error names what happened **and** how to resolve it. Pair the message with a button or link that performs the fix.

Before:
"Invalid API key."

After:
"Your API key is incorrect or expired. Generate a new key in your account settings."

### Specific labels, no ambiguous CTAs

Buttons describe their action. "Continue", "Submit", "OK", and "Done" are too vague.

Before:
"Continue"

After:
"Save API Key" / "Deploy Project" / "Invite Members"

### Pond checklist (in addition to the core checklist)

- [ ] Is every heading and button in Title Case? (Marketing pages: sentence case.)
- [ ] Are body, descriptions, and helper text in sentence case?
- [ ] Is `&` used in headings/buttons/labels and `and` in body sentences?
- [ ] Is every number a numeral, and is there a non-breaking space between the number and its unit?
- [ ] Does every error message tell the user how to fix it?
- [ ] Do button labels name the action (no "Continue" or "OK")?
- [ ] Are placeholders `YOUR_X_HERE` style strings or `0123456789` numbers?
- [ ] Is currency formatting consistent (all 0 decimals or all 2) across the surface?

## Common rewrites

| Before | After |
| --- | --- |
| "Allows you to manage your notifications." | "Manage your notifications." |
| "We are excited to announce that you can now publish releases." | "You can now publish releases." |
| "Click here to learn more." | "Read the docs." |
| "Powerful, intuitive, and easy to use." | "Plan, ship, and review work in one tool." |
| "An error has occurred." | "Couldn't save. Check your connection and try again." |
| "Are you sure you want to delete this?" | "Delete this issue?" |
| "Your file has been successfully uploaded." | "Uploaded." |
| "Please enter a valid email address." | "Enter a valid email." |
| "This feature is currently in beta." | "Beta." |
| "Coming soon!" | "Available next month." (or remove it.) |
| "Helps you save time by automating things." | "Automates triage, routing, and labels." |
| "A revolutionary new way to deploy." | "Deploy on push." |

## Checklist

Run this before shipping any user-facing string.

- [ ] Is the description one sentence? If two, do both earn their place?
- [ ] Are there any em dashes? Restructure them out.
- [ ] Is it present tense and active voice?
- [ ] Does the description repeat the heading? Cut the repetition.
- [ ] Any "just", "simply", "actually", "really", "of course"? Cut them.
- [ ] Any "the user", "the experience", "the platform"? Replace with the actual noun.
- [ ] Are numbers digits?
- [ ] Is sentence-case applied? (Title-case only for page titles and brand names.)
- [ ] Are verbs concrete? (No "leverage", "empower", "unlock", "supercharge".)
- [ ] Read it out loud. Does it sound like a person, or a press release?

## Edge cases

**Error messages.** Lead with what happened, then what to do. Keep it under 12 words. Don't blame the user.

> "Couldn't connect to the server. Check your network and retry."

**Destructive actions.** Name the thing being destroyed and the consequence. Confirm with a verb, not "OK".

> Title: "Delete project?"
> Body: "This deletes 47 issues, 3 documents, and all attachments. This can't be undone."
> Buttons: "Cancel" / "Delete project"

**Empty states.** Describe what goes here in one line, then offer the next action.

> "No issues yet. Press C to create your first one."

**Success toasts.** A past-tense verb, optionally with the object. No exclamation marks.

> "Saved." or "Issue created." or "3 invites sent."

**Settings descriptions.** One line, present tense. The description complements the label; it does not repeat it.

> Label: "Two-factor authentication"
> Description: "Add a second step to every sign-in."

**When warmth is welcome.** Hero copy, onboarding success, friendly empty states, the about page. Earn warmth with better verbs and rhythm, not extra words. Family-style paired clauses are a useful pattern here.

> Cold: "All assets shown in one view."
> Warm: "See everything you own at a glance."

**When warmth is wrong.** Errors, destructive confirmations, security messages, billing changes, and dense technical settings. Be plain and exact.

**"We" vs "you" vs nothing.** Use "you" for the reader's actions. Use "we" only when the company is the actor ("We charge your card on the 1st."). When the subject is the product, drop the pronoun and lead with a verb ("Sync every 5 minutes.").

## When NOT to apply this skill

This skill is for user-facing copy. Skip it for:

- Code comments and JSDoc.
- Commit messages (follow the repo's commit conventions instead).
- Variable, function, and file names.
- Internal API responses, log lines, and machine-readable strings.
- Long-form technical references where exhaustive precision matters more than brevity (full API docs, security audit reports, migration guides). The principles still help, but length follows from the content.
