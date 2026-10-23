"""Compatibility entry point; semantic decisions now live in agent_policy."""
from .agent_policy import decide_evidence
from .answering import generate_answer


def unified_answer(retrieval, model, catalog, context, history, max_evidence, external_attempted, previous_queries=None):
    decision = decide_evidence(retrieval, model, catalog, context, history, max_evidence,
        can_search=not external_attempted, attempts=[{"queries": previous_queries or []}], feedback=[])
    result = generate_answer(retrieval, decision["selection"], model)
    return {**result, "search_queries": decision["queries"], "action": decision["action"]}
