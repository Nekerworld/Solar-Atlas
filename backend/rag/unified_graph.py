"""Atlas chooses actions; LangGraph enforces bounded tool execution."""
import logging
from time import monotonic
from typing import TypedDict

from .agent_policy import plan_request, decide_evidence, conversational_result
from .answering import generate_answer
from .search_context import retrieve_context, prioritize_collected
from .presentation import present_result
from .comparison_review import review_comparison
from .model_routing import RoutedModel, stage_model, escalate
from .timing import timed


def comparison_stage(context, question, retrieval):
    # A model-planned operation, never a keyword/planet-count answer rule.
    return context.get("requires_comparison") is True and bool(retrieval.get("chunks") or retrieval.get("profiles"))


class State(TypedDict, total=False):
    retrieval: dict
    decision: dict
    result: dict
    attempts: list
    feedback: list
    trace: list
    steps: list
    decision_count: int


@timed("atlas.total")
def run_unified_graph(store, embeddings, model, catalog, item_id, question, *,
                      candidates=12, max_evidence=8, history=None, collector=None, progress=None, plan=None):
    from django.conf import settings
    from langgraph.graph import END, START, StateGraph
    if not question.strip() or not 1 <= candidates <= 20 or not 1 <= max_evidence <= 12:
        raise ValueError("Invalid question or retrieval limits")
    context = plan or plan_request(model, catalog, item_id, question, history)
    if context["action"] != "retrieve":
        return conversational_result(context, item_id, question)
    max_searches = getattr(settings, "RAG_AGENT_MAX_SEARCHES", 2)
    max_decisions = getattr(settings, "RAG_AGENT_MAX_DECISIONS", 4)
    deadline = monotonic() + getattr(settings, "RAG_AGENT_TIME_BUDGET", 90)

    def step(state, name):
        if progress:
            progress("NODE: " + name)
        return [*state.get("steps", []), name]

    def can_search(state):
        return (collector is not None and len(state["attempts"]) < max_searches
                and state["decision_count"] < max_decisions and monotonic() < deadline)

    def retrieve(state):
        steps = step(state, "retrieve_global")
        search_context = dict(context)
        if state["attempts"]:
            # Search tools express the missing concept. Use it for focused
            # retrieval too, rather than asking the original vague query again.
            latest = state["attempts"][-1].get("queries", [])
            search_context["search_question"] += "\n추가 확인: " + " / ".join(task["query"] for task in latest)
        retrieval = retrieve_context(store, embeddings, catalog, item_id, search_context, candidates)
        documents = [doc for attempt in state["attempts"] for doc in attempt.get("documents", [])]
        if documents:
            retrieval = prioritize_collected(retrieval, store, embeddings, documents, search_context["search_question"])
        retrieval["question"] = question
        return {"retrieval": retrieval, "steps": steps}

    def assess(state):
        if state["feedback"] or state["attempts"]:
            escalate(model, "reassessment")
        name = "compare_evidence" if comparison_stage(context, question, state["retrieval"]) else "select_evidence"
        steps = step(state, name)
        decision = decide_evidence(state["retrieval"], stage_model(model, "assess"), catalog, context, history, max_evidence,
            can_search=can_search(state), attempts=state["attempts"], feedback=state["feedback"])
        if (isinstance(model, RoutedModel) and model.limit and not model.escalated
                and decision["action"] == "stop" and decision["selection"]["coverage"] == "insufficient"):
            model.escalate("insufficient_stop")
            decision = decide_evidence(state["retrieval"], stage_model(model, "assess"), catalog, context, history, max_evidence,
                can_search=can_search(state), attempts=state["attempts"], feedback=state["feedback"])
        trace = {"action": decision["action"], "coverage": decision["selection"]["coverage"],
                 "assessment": decision["assessment"], "queries": decision["queries"],
                 "evidence": [{"id": row["evidence_id"], "title": row["source"]["title"], "quote": row["quote"]}
                              for row in decision["selection"]["evidence"]]}
        return {"decision": decision, "decision_count": state["decision_count"] + 1,
                "trace": [*state["trace"], trace], "steps": steps}

    def route(state):
        decision = state["decision"]
        if decision["action"] == "search" and decision["queries"] and can_search(state):
            return "collect"
        if decision["action"] in {"clarify", "stop"}:
            return "compose" if decision["selection"]["evidence"] and decision["action"] == "stop" else "finish"
        if decision["action"] == "answer" and decision["selection"]["evidence"]:
            return "compose"
        if state["decision_count"] < max_decisions and monotonic() < deadline:
            return "repair"
        return "compose" if decision["selection"]["evidence"] else "finish"

    def repair(state):
        feedback = {"code": "invalid_or_duplicate_tool_request" if state["decision"]["action"] == "search" else "missing_valid_evidence",
                    "instruction": "Choose a different search query or a supported partial answer/clarification/stop. Never repeat the rejected output."}
        return {"feedback": [*state["feedback"], feedback]}

    def collect(state):
        steps = step(state, "collect_wikipedia")
        tasks = state["decision"]["queries"]
        try:
            report = collector.collect_direct(state["retrieval"], tasks, catalog)
        except Exception as error:
            report = {"status": "failed", "errors": [{"error": type(error).__name__}], "documents": []}
        report = {**report, "queries": tasks}
        logging.getLogger("rag.timing").info("[ATLAS COLLECTION] pass=%d report=%s", len(state["attempts"]) + 1, report)
        return {"attempts": [*state["attempts"], report], "steps": steps}

    def compose(state):
        if state["decision"]["selection"]["coverage"] != "sufficient":
            escalate(model, "incomplete_evidence")
        steps = step(state, "generate_answer")
        result = generate_answer(state["retrieval"], state["decision"]["selection"], stage_model(model, "compose"),
            guidance={"assessment": state["decision"]["assessment"], "original_question": question,
                      "history": (history or [])[-4:], "observed_body": catalog.get(item_id),
                      "resolved_subjects": [catalog[key] for key in context["target_ids"] if key in catalog]})
        if context.get("requires_comparison") and result.get("statements"):
            steps = step({**state, "steps": steps}, "compare_evidence")
            try:
                result = review_comparison(result, state["decision"]["selection"], question, stage_model(model, "review"))
            except Exception as error:
                logging.getLogger("rag.timing").warning("[COMPARISON REVIEW] error=%s", type(error).__name__)
                result.update(coverage="insufficient", statements=[], sources=[], comparison_reviewed=False,
                              comparison_feedback="Comparison review did not complete; choose supported evidence or stop.")
        return {"result": result, "steps": steps}

    def after_compose(state):
        if (state["result"]["coverage"] == "insufficient" and state["decision_count"] < max_decisions
                and monotonic() < deadline):
            return "repair_answer"
        return END

    def repair_answer(state):
        return {"feedback": [*state["feedback"], {"code": "answer_citation_validation_failed",
            "instruction": "Select correct exact quotes/IDs, or search/stop. The final generator produced no valid supported statements.",
            "comparison_feedback": state["result"].get("comparison_feedback", "")}]}

    def finish(state):
        decision = state["decision"]
        reply = decision["reply"] or "지금은 질문에 정확히 답할 만큼 정보를 확인하지 못했어요."
        return {"result": {"item_id": item_id, "question": question, "coverage": "insufficient", "answer": reply,
            "statements": [], "sources": [], "warnings": [], "missing_information": decision["selection"]["missing_information"],
            "needs_clarification": decision["action"] == "clarify", "limit_reply": reply,
            "selected_evidence": [], "retrieved_chunks": len(state["retrieval"]["chunks"])}}

    builder = StateGraph(State)
    for name, fn in {"retrieve": retrieve, "assess": assess, "repair": repair, "collect": collect,
                     "compose": compose, "repair_answer": repair_answer, "finish": finish}.items():
        builder.add_node(name, timed("node." + name)(fn))
    builder.add_edge(START, "retrieve")
    builder.add_edge("retrieve", "assess")
    builder.add_conditional_edges("assess", route)
    builder.add_edge("repair", "assess")
    builder.add_edge("collect", "retrieve")
    builder.add_conditional_edges("compose", after_compose)
    builder.add_edge("repair_answer", "assess")
    builder.add_edge("finish", END)
    state = builder.compile().invoke({"attempts": [], "feedback": [], "trace": [], "steps": [], "decision_count": 0},
                                     config={"recursion_limit": 28})
    last = state["attempts"][-1] if state["attempts"] else {"status": "not_needed" if collector else "disabled"}
    collection = {**last, "attempts": state["attempts"]}
    result = present_result(state["result"], collection)
    if result.get("limit_reply"):
        result["display_answer"] = result.pop("limit_reply")
    result["answer"] = result["display_answer"]
    return {**result, "target_ids": context["target_ids"], "search_question": context["search_question"],
            "graph_path": state["steps"], "agent_trace": state["trace"], "collection": collection}
