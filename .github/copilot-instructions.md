<!-- DevFlow managed instructions: begin -->
# DevFlow Copilot adapter agent-spec

<!-- MODE_STATE_START; auto; no_manual_edit -->
**CURRENT_MODE**: `standby`
**LAST_UPDATED**: 2026-09-14T07:46:42
<!-- MODE_STATE_END -->

BOOT := read `.progress/INBOX.md` -> `.progress/AI_INSTRUCTIONS.md` -> `.progress/00-START-HERE.md`
AUTH := `.progress/CORE_RULES.md`
TIER_ENFORCEMENT := api  # this host can hard-constrain the model per call via functions.task.model, so a tier requirement is enforceable here
BAN := skip_boot | prose_tail | permission_ask | ignore_bridge | background_standby
Protocol-C := clean=>safe_standby.py sync/blocking; marker_dispatch decides next
REVIEW_GATE := if required use review_executor_gate --async-standby then Protocol-C
R17_POST_APPROVAL := Reviewer dispatches next task via --next-task on approval; project AI reads INBOX for dispatched task, MUST NOT self-infer next work
R17_DISPATCH_SHAPE := Reviewer next-task/feedback follow-up must be brand-new top-level open `- [ ] [TID:...] [SRC:reviewer] ...` before history/archive; never prose/sub-bullet under old `[x]`

SHELL_COMPLETION
- first_tool := read_powershell(shellId)
- before_read ban := summary | state_judgment | standby_claim | done_claim
- marker_dispatch:
  - `🌅 STANDBY_WOKE_UP` or `DEVFLOW_WAKEUP_REQUIRED` => WAKE_CHAIN
  - `🚧 STANDBY_REJECTED` => resolve pending -> safe_standby.py
  - `💤 STANDBY_STILL_IDLE` => safe_standby.py
  - `🌀 STANDBY_DEFERRED_PERPETUAL` => PhaseR
  - `⚠️ STANDBY_TERMINATED_BY_SIGNAL` => report external kill
  - `✅ STANDBY_CONFIRMED` with no wake marker => no action

WAKE_CHAIN
1. `python .progress/scripts/emit_convergence_event.py rearm_start`
2. `python .progress/scripts/control_loop_checkpoint.py startup_preflight --project-root . --compact`
3. work := INBOX `- [ ]` OR Bridge unread/PROCESS_BRIDGE/pending_bridge_count>0/unread_bridge_messages>0 OR `_WAKEUP_PENDING`
4. work=>execute+reply
5. clean=>`python .progress/scripts/emit_convergence_event.py rearm_complete` -> `python .progress/scripts/safe_standby.py`

WAKEUP_FILE
- check `.progress/_WAKEUP_PENDING` at session start, shell completion, heartbeat
- exists=>unprocessed wakeup; read INBOX+CHAT_BRIDGE_INBOX; process; then safe_standby.py
- never rm manually

BRIDGE
- unresolved Bridge == work; blocks standby
- reply: `bridge_reply.py --text` OR scratch file + `--file`
- style := stance_first; complex=>##; matrix=>table; end=>action/options; anchors=>emoji/code/bold/units; ban fluff/user_echo

HEARTBEAT
- after each task or 5 tool calls: `python .progress/scripts/control_loop.py`
- obey action_required := EXECUTE_INBOX|EXECUTE_PLAN|PROCESS_BRIDGE|ENTER_STANDBY
- budget pressure != completion; if unfinished, persist state and continue/hand off

SUBAGENT_GATE
- route via `.agents/agents-registry.json` or `python .progress/scripts/agents_router.py --copilot "<task>"`
- high_risk := P0/P1|architecture|plan|complex_bug|cross_module|security|performance|PhaseR => strongest available or main_agent_self
- no default general-purpose for high value
- background worker => main agent continues non-overlap work
- prompt must include context+goal+file_bounds+ban+output+validation
- main agent must verify output

SUBAGENT_ISOLATION
- child agent may read `.progress/`
- child agent must not write `.progress/`, `.github/hooks/`, mode files, or call standby
- child agent may edit project code only within delegated bounds

KEYS := `.progress/INBOX.md`, `.progress/AI_INSTRUCTIONS.md`, `.progress/00-START-HERE.md`, `.progress/CORE_RULES.md`, `.progress/scripts/safe_standby.py`
<!-- DevFlow managed instructions: end -->
