"""Moderator agent.

- plan():          one LLM call that assigns non-overlapping topics to the examiners.
- next_speaker():  deterministic turn-taking policy (round-robin over examiners who still have topics).
- challenger_for(): who gets to react to a colleague's verdict.

Turn-taking is plain code on purpose: it's instant, free, predictable in a live demo, and the
reasoning it gives is shown in the UI. The judgement calls (what to probe, whether to interject)
are left to the LLM agents.
"""
from __future__ import annotations

from pathlib import Path

from . import llm
from .examiner import DISPLAY, render_summary
from .guardrails import file_ref_exists, split_ref
from .schemas import Examiner as Role, KeyFile, PanelPlan, PlannedTopic, ProjectSummary, Turn

PROMPTS = Path(__file__).parent / "prompts"
ORDER: tuple[Role, ...] = ("professor", "engineer", "junior")
MAX_TOPICS_PER_EXAMINER = 2

# Offline planning: keywords that pull a file into an examiner's lane.
# Weighted so security/concurrency smells go to the Engineer first.
LANE_KEYWORDS: dict[Role, tuple[tuple[str, int], ...]] = {
    "engineer": (("f\"select", 5), ("f'select", 5), ("secret", 4), ("sha256", 4), ("password", 2), ("token", 2),
                 ("available", 3), ("update ", 2), ("concurr", 3), ("409", 2)),
    "professor": (("connect", 3), ("schema", 2), ("init", 2), ("calculate", 3), ("min(", 2), ("service", 2),
                  ("algorithm", 3), ("design", 2)),
    "junior": (("route", 1), ("return {", 1), ("list", 1), ("main", 1)),
}


def is_test_file(path: str) -> bool:
    name = path.rsplit("/", 1)[-1]
    return path.startswith(("tests/", "test/")) or name.startswith("test_") or name.endswith(("_test.py", ".test.js", ".spec.js"))


def _plain(word: str) -> bool:
    """A capitalised ordinary word ("Design"), not an acronym (JWT) or a name with inner capitals (MarkupSafe)."""
    return word[:1].isupper() and word[1:].islower()


def _soft_lower(title: str) -> str:
    """Make a topic title fit mid-sentence: "What Is MarkupSafe" -> "what is MarkupSafe", "JWT Expiry" -> "JWT expiry"."""
    words = title.split(" ")
    if len(words) > 1 and all(_plain(w) or not w[:1].islower() for w in words):  # Title Case from the model
        words = [w.lower() if _plain(w) else w for w in words]
    elif _plain(words[0]):
        words[0] = words[0].lower()
    return " ".join(words)


class Moderator:
    def __init__(self, summary: ProjectSummary, examiners: tuple[Role, ...] = ORDER):
        self.summary = summary
        self.examiners = examiners

    # ---------- planning ----------

    def plan(self) -> PanelPlan:
        raw = self._offline_plan() if llm.is_offline() else self._llm_plan()
        return self._validate(raw)

    def _llm_plan(self) -> PanelPlan:
        system = (PROMPTS / "moderator.md").read_text() + "\n\n## Project\n" + render_summary(self.summary)
        user = (
            f"Examiners on today's panel: {', '.join(self.examiners)}. "
            "Assign topics only to these examiners. Produce the plan."
        )
        return llm.structured_call(system, user, PanelPlan, effort="medium")

    def _validate(self, plan: PanelPlan) -> PanelPlan:
        """Drop topics with invented files, wrong examiners, or duplicate anchors; cap per examiner."""
        seen_refs: set[str] = set()
        per_examiner: dict[str, int] = {}
        kept: list[PlannedTopic] = []
        for t in plan.topics:
            if t.examiner not in self.examiners or not file_ref_exists(t.file_ref, self.summary):
                continue
            if t.file_ref in seen_refs or per_examiner.get(t.examiner, 0) >= MAX_TOPICS_PER_EXAMINER:
                continue
            seen_refs.add(t.file_ref)
            per_examiner[t.examiner] = per_examiner.get(t.examiner, 0) + 1
            kept.append(t)
        # Every examiner must have at least one topic; top up from the offline planner if the LLM missed one.
        for role in self.examiners:
            if per_examiner.get(role):
                continue
            extra = next(
                (t for t in self._offline_plan().topics if t.examiner == role and t.file_ref not in seen_refs),
                None,
            )
            if extra:
                seen_refs.add(extra.file_ref)
                kept.append(extra)
        return PanelPlan(topics=kept)

    def _offline_plan(self) -> PanelPlan:
        """Assign each key file to the examiner whose lane keywords it matches best, round-robin on ties."""
        topics: list[PlannedTopic] = []
        load = {r: 0 for r in self.examiners}
        files = [kf for kf in self.summary.key_files if not is_test_file(kf.path)]
        for i, kf in enumerate(files):
            role = self._best_lane(kf, load, tie_break=i)
            if role is None:
                continue
            load[role] += 1
            func = kf.functions[0] if kf.functions else None
            topics.append(
                PlannedTopic(
                    examiner=role,
                    title=f"{func} in {kf.path.rsplit('/', 1)[-1]}" if func else kf.path,
                    file_ref=f"{kf.path}:{func}" if func else kf.path,
                    why=f"Core logic in {kf.path} — {kf.purpose[0].lower() + kf.purpose[1:]}",
                )
            )
        return PanelPlan(topics=topics)

    def _best_lane(self, kf: KeyFile, load: dict[Role, int], tie_break: int) -> Role | None:
        text = (kf.path + " " + kf.snippet).lower()
        open_roles = [r for r in self.examiners if load[r] < MAX_TOPICS_PER_EXAMINER]
        if not open_roles:
            return None
        def score(r: Role) -> tuple[int, int]:
            hits = sum(w * text.count(k) for k, w in LANE_KEYWORDS[r])
            return (hits - 3 * load[r], -((self.examiners.index(r) - tie_break) % len(self.examiners)))
        return max(open_roles, key=score)

    # ---------- turn-taking ----------

    def next_speaker(self, current: Role | None, queues: dict[str, list[PlannedTopic]]) -> Role | None:
        """Round-robin starting after `current`, skipping examiners with no topics left."""
        start = (self.examiners.index(current) + 1) if current in self.examiners else 0
        for k in range(len(self.examiners)):
            role = self.examiners[(start + k) % len(self.examiners)]
            if queues.get(role):
                return role
        return None

    def challenger_for(self, last: Turn, challenges_so_far: int) -> Role | None:
        """Pick a colleague to react. The Engineer is the natural sceptic; otherwise alternate."""
        others = [r for r in self.examiners if r != last.examiner]
        if not others:
            return None
        if "engineer" in others and challenges_so_far % 2 == 0:
            return "engineer"
        return others[challenges_so_far % len(others)]

    # ---------- what the moderator says out loud ----------

    def plan_announcement(self, plan: PanelPlan) -> tuple[str, str]:
        by_role: dict[str, list[str]] = {}
        for t in plan.topics:
            by_role.setdefault(t.examiner, []).append(t.title)
        body = "; ".join(
            f"the {DISPLAY[r]} will ask about {' and '.join(_soft_lower(t) for t in titles)}"
            for r, titles in by_role.items()
        )
        message = f"Welcome to your viva. {body[0].upper()}{body[1:]}."
        reasoning = " | ".join(f"{DISPLAY[t.examiner]} → {split_ref(t.file_ref)[0]}: {t.why}" for t in plan.topics)
        return message, reasoning
