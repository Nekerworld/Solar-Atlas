import json

from django.core.management.base import BaseCommand, CommandError

from rag.config import IndexConfig


class Command(BaseCommand):
    help = "Run solar RAG with one optional Wikipedia enrichment attempt."

    def add_arguments(self, parser):
        parser.add_argument("question")
        parser.add_argument("--item", required=True, metavar="QID")
        parser.add_argument("--candidates", type=int, default=12)
        parser.add_argument("--max-evidence", type=int, default=8)
        parser.add_argument("--chroma-dir")
        parser.add_argument("--env-file")
        parser.add_argument("--no-external", action="store_true", help="Use existing index only.")
        parser.add_argument("--show-steps", action="store_true")
        parser.add_argument("--json", action="store_true", dest="as_json")

    def handle(self, *args, **options):
        try:
            if not options["question"].strip() or not options["item"].strip():
                raise ValueError("Question and --item must not be empty.")
            if not 1 <= options["candidates"] <= 20 or not 1 <= options["max_evidence"] <= 12:
                raise ValueError("--candidates must be 1..20; --max-evidence must be 1..12.")
            from langgraph.graph import StateGraph  # noqa: F401
            from rag.service import RAGService

            config = IndexConfig.from_django(chroma_dir=options["chroma_dir"], env_file=options["env_file"])
            service = RAGService(config)
            progress = None
            if options["show_steps"]:
                progress = self.stderr.write if options["as_json"] else self.stdout.write
            result = service.answer(options["item"], options["question"], candidates=options["candidates"],
                                    max_evidence=options["max_evidence"], progress=progress,
                                    allow_external=not options["no_external"])
        except ImportError:
            raise CommandError("Missing dependency. Install project requirements.txt first.") from None
        except (ValueError, OSError, RuntimeError) as error:
            raise CommandError(str(error)) from None
        if options["as_json"]:
            self.stdout.write(json.dumps(result, ensure_ascii=False, indent=2))
            return
        self.stdout.write(f"Item: {result['item_id']}")
        self.stdout.write("Graph: " + " -> ".join(result["graph_path"]))
        self.stdout.write(f"Coverage: {result['coverage']} / collection: {result['collection'].get('status')}")
        self.stdout.write("\n[Answer]\n" + result["answer"])
        self.stdout.write("\n[Sources actually cited]")
        for source in result["sources"]:
            self.stdout.write(f"[{source['evidence_id']}] {source['title']} / {source['section']}")
            self.stdout.write(f"URL: {source['url']}\nRecord: {source['record_id']}\nQuote: {source['quote']}")
        for warning in result["warnings"]:
            self.stdout.write(self.style.WARNING(warning))
        self.stdout.write(self.style.SUCCESS("\nANSWER OK (coverage is reported separately)."))
