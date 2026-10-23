"""User-facing completion text, independent of retained grounding diagnostics."""


def present_result(result, collection):
    result = dict(result)
    result["diagnostics"] = {"missing_information": result.get("missing_information", []),
                             "warnings": result.get("warnings", [])}
    result["warnings"] = []
    if result.get("needs_clarification"):
        result["display_answer"] = result["answer"]
        return result
    lines = [row["text"] for row in result.get("statements", [])]
    if result["coverage"] == "sufficient":
        result["display_answer"] = "\n\n".join(lines) or result["answer"]
        return result
    attempts = collection.get("attempts", [])
    documents = [doc for attempt in attempts for doc in attempt.get("documents", [])]
    failed = any(attempt.get("errors") or attempt.get("status") in {"failed", "busy"} for attempt in attempts)
    if lines:
        ending = "여기까지는 확인했어요. 나머지 부분은 아직 정확히 말씀드리기 어려워요."
        if failed:
            ending += " 추가 정보를 가져오는 중에도 어려움이 있었어요."
    elif documents:
        ending = "관련 문서도 살펴봤지만, 질문에 정확히 답할 만큼의 내용은 확인하지 못했어요."
    elif failed:
        ending = "추가 정보를 가져오는 중 문제가 생겼어요. 지금은 정확한 답을 알려드리기 어려워요."
    elif attempts:
        ending = "추가로 찾아봤지만, 질문에 맞는 정보를 확인하지 못했어요."
    else:
        ending = "지금은 이 질문에 정확히 답할 만큼 정보를 확인하지 못했어요."
    result["display_answer"] = "\n\n".join([*lines, ending])
    return result
