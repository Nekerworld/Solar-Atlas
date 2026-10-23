"""Importing this module never starts collection."""
import argparse
from pathlib import Path
from dotenv import load_dotenv
from solar.config import DEFAULT_ENV, ROOT, GROUPS
from solar.pipeline import run


def parser():
    p = argparse.ArgumentParser(description="태양계 천체·영역 수집 (GMS gpt-6-luna)")
    p.add_argument("--env-file", type=Path, default=DEFAULT_ENV, help="기본값: collect.py와 같은 폴더의 .env")
    p.add_argument("--output", type=Path, default=ROOT/"data"/"solar_v1")
    p.add_argument("--group", choices=GROUPS, default="all", help="expansion: 최근 추가 30종, new: 기존 확장 57종과 최근 30종")
    p.add_argument("--only", nargs="+", help="부분 수집: 달 또는 Q405 등")
    p.add_argument("--max-related", type=int, default=4)
    p.add_argument("--interval", type=float, default=1.0)
    p.add_argument("--refresh", action="store_true", help="완료 상태와 HTTP/LLM 캐시 무시")
    p.add_argument("--audit-only", action="store_true", help="로컬 자료 품질 진단만 수행 (API/번역/색인 호출 없음)")
    p.add_argument("--enrich-only", action="store_true", help="기존 수집 자료의 영어 보완/번역만 재개")
    p.add_argument("--max-english-related", type=int, default=2, help="천체별 영문 관련 주제 검색 상한 (영문 자체 문서 별도)")
    return p


def main():
    p = parser()
    args = p.parse_args()
    if args.max_related < 0 or args.interval < 0 or not 0 <= args.max_english_related <= 4:
        p.error("--max-related/--interval must be nonnegative; --max-english-related must be between 0 and 4")
    load_dotenv(args.env_file, override=False)
    try:
        from solar.bilingual import local_audit, enrich
        from solar.clients import HTTP, LLM, read_json
        from solar.config import select_targets
        from solar.pipeline import export_processed
        chosen = select_targets(args.group, args.only)
        if args.audit_only:
            report = local_audit(args.output.resolve(), chosen)
            print(f"AUDIT OK: {report['targets']} targets; data/solar_v1/processed/quality_audit.json")
            return 0
        if not args.enrich_only:
            run(args)
        http = HTTP(args.output / 'cache', args.interval, args.refresh)
        llm = LLM(http, args.env_file)
        success = enrich(args, http, llm)
        report_path = args.output / 'processed' / 'collection_report.json'
        report = read_json(report_path) if report_path.exists() else {'items': []}
        from solar.wiki import now
        report['enrichment_exported_at'] = now()
        report['model'] = 'gpt-6-luna'
        result = export_processed(args.output.resolve(), chosen, report)
        return result if success else 1
    except (ValueError, OSError) as error:
        print(f"Configuration/storage error: {type(error).__name__}. Check --env-file, GMS_KEY and output permissions.")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
