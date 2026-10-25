# GTMagic

> Find out who will buy from you, why, and what to say to them, before you spend money on marketing.

GTMagic helps small businesses and founders work out who to sell to and what to say. It researches your market and builds a synthetic audience from **real customer quotes**. It then has that audience choose blind between competing messages, including your current headline. You get three plain answers: who to target, what to say, and what to try this week.

![The original whiteboard sketch](docs/sketch.webp)

## Status: planning, no code yet

The repo holds the plan and the folder layout. Code starts when the team says go; the kickoff steps are in the Day-0 checklist in [docs/COLLABORATION.md](docs/COLLABORATION.md).

### Planned before the event

The docs in `docs/` (requirements, architecture, data contracts, task split) and the folder READMEs were written before the event as planning. All code is written during the hackathon.

## How one run works

1. **Describe your business:** a description, plus optionally your website, your guess at your best customer, your current headline, and pasted customer reviews or emails. Or click **Try an example**.
2. **Research:** finds customer groups, competitors, and how real customers describe the problem, each with a source link.
3. **Audience:** about 48 synthetic customers, each built from one customer group and "talking like" 3–5 real quotes. It's rebuilt fresh from the evidence on every run, so it never drifts.
4. **Test:** each customer sees 4–6 messages plus your current headline, unbranded and in a balanced order, and picks one or "none of these."
5. **Decide:** a recommendation computed from the counts, including an honest "your guess was right" when it is. Then objections, draft copy, and a ranked list of cheap real-world tests.

Synthetic customers produce **hypotheses to test**, not proof. Every result is labeled that way.

## Docs

| Doc | What's in it |
|---|---|
| [REQUIREMENTS.md](docs/REQUIREMENTS.md) | Who it's for, MVP scope, acceptance criteria, how we score against the judging, open questions |
| [TECH_STACK.md](docs/TECH_STACK.md) | Stack, models, cost and time per run, Claude API facts |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Pipeline, orchestration, failure handling, API, storage, security |
| [CONTRACTS.md](docs/CONTRACTS.md) | The data passed between modules: the team's shared language |
| [TASKS.md](docs/TASKS.md) | Work per owner, checkpoints, demo plan |
| [COLLABORATION.md](docs/COLLABORATION.md) | GitHub workflow, ownership, Day-0 and after-event checklists |

## Team

| Workstream | Owner | Folders |
|---|---|---|
| Platform & Integration (lead) | Nick | `src/contracts`, `src/platform`, `src/app/api` |
| Market Intelligence & Strategy | _TBD_ | `src/modules/market-intelligence`, `src/modules/reporting` |
| Synthetic Audience | _TBD_ | `src/modules/audience` |
| Positioning & Experiments | _TBD_ | `src/modules/positioning`, `src/modules/experiments` |
| Founder Experience (+ pitch, user research) | _TBD_ | `src/app` (UI), `src/components` |

## Getting started

From a fresh clone to running the skills in about 15 minutes. The web app (`npm run dev`) isn't scaffolded yet; these steps set up the Claude Code skills in `.claude/skills/`. The key scripts are built for macOS, where keys live in your login Keychain. On Linux or WSL, see [Not on a Mac?](#not-on-a-mac).

### 1. Install the prerequisites and clone

| You need | Why | Check |
|---|---|---|
| git | Clone the repo, open PRs | `git --version` |
| Python 3.9 or newer | The skills' helper scripts (standard library only, nothing to `pip install`) | `python3 --version` |
| [Claude Code](https://claude.com/claude-code), signed in (CLI or desktop app) | Runs the skills | `claude --version` |

On a Mac, `xcode-select --install` provides git and Python 3 if either check fails. Node isn't needed for the skills; `evals/` has its own setup in [evals/README.md](evals/README.md).

```bash
git clone https://github.com/nsbogert/GTMagic.git
cd GTMagic
```

To push branches, ask Nick for Write access to the repo.

### 2. Get a Tavily key (market research)

The research step searches the web through Tavily.

1. Sign up at [app.tavily.com](https://app.tavily.com). The free plan includes a monthly allowance of search credits.
2. On the dashboard, under **API Keys**, copy your key. It starts with `tvly-`.

Paste it only into the setup prompt in step 4: never into chat, a file or a commit.

### 3. Get an OpenRouter key (draft creatives, optional)

The `gtm-creatives` skill writes draft ads with GPT Sol through OpenRouter. Skip this step if you won't run it.

1. Sign up at [openrouter.ai](https://openrouter.ai).
2. Add credits at [Settings → Credits](https://openrouter.ai/settings/credits). GPT Sol is a paid model, so a key on an account with no credits fails. A few dollars is enough to start.
3. Create a key at [Settings → API Keys](https://openrouter.ai/settings/keys). Name it `gtmagic` and set a **credit limit**, so a runaway loop can't drain your balance. Copy the key (it starts with `sk-or-`); OpenRouter shows it only once.

### 4. Save the keys

```bash
scripts/setup-keys.sh
```

For each key, it asks you to paste it at a hidden prompt, saves it in your macOS login Keychain, then runs the check from step 5. Nothing is shown on screen or written to the repo, and the key never appears on a command line. To add or replace one key, name it: `scripts/setup-keys.sh tavily` or `scripts/setup-keys.sh openrouter`.

The skills look for each key in this order:

| Key | 1. Environment variable | 2. Keychain item (account: your macOS user) |
|---|---|---|
| Tavily | `TAVILY_API_KEY` | `gtmagic-tavily` |
| OpenRouter | `OPENROUTER_API_KEY` | `gtmagic-openrouter` |

The environment variable wins, so an old one in your shell profile hides a fresh Keychain key. The check flags that case.

### 5. Check the keys

```bash
scripts/check-keys.sh
```

It confirms each key is present and accepted, and shows the credits left. It never prints a key, and it calls each provider's free account endpoint, so it spends no credits. It exits 0 when every key is usable and 1 otherwise. Check one key with `scripts/check-keys.sh tavily`. Example output:

```text
Checking GTMagic API keys (the keys themselves are never shown):
  [ok]   Tavily      1,500 plan credits left this billing cycle (key from Keychain item 'gtmagic-tavily')
  [ok]   OpenRouter  $5.00 left under this key's credit limit (key from Keychain item 'gtmagic-openrouter')
All set.
```

| If it says | Do this |
|---|---|
| `no key found` | Run `scripts/setup-keys.sh tavily` (or `openrouter`) |
| `was rejected (HTTP 401)` | Copy the key again from the provider's dashboard and rerun the setup script. If the key came from an environment variable, fix or unset that variable |
| `no credits bought on this account yet` | Add OpenRouter credits (step 3) |
| `credit limit is used up` | Raise the key's limit on the provider's dashboard |
| `couldn't reach …` | A network, VPN or proxy problem; try again |

### 6. Run the skills

Start Claude Code in the repo folder (`claude` in a terminal, or open the folder in the desktop app) and describe your business, for example: "Who should I target? I run a mobile dog-grooming van." The `gtm-intake` skill starts the interview and writes its files to `gtm-workspace/<your-business>/`, which is gitignored and stays on your machine. Each skill's `SKILL.md` in `.claude/skills/` says what it does and when it runs.

### Not on a Mac?

`setup-keys.sh` needs the macOS Keychain. On Linux or WSL, add the keys to your shell profile (`~/.bashrc` or `~/.zshrc`) with an editor. Don't type `export` at the prompt, which saves the key in your shell history.

```bash
export TAVILY_API_KEY="tvly-..."
export OPENROUTER_API_KEY="sk-or-..."
```

Open a new terminal, then run `scripts/check-keys.sh`; it works anywhere with bash and curl. There's no `.env.local` option because the skills read keys only from the environment or the Keychain, so a key file in the repo would be invisible to them.
