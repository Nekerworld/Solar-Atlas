import json

from django.core.management.base import BaseCommand, CommandError

from rag.config import IndexConfig
from rag.retrieval import retrieve


class Command(BaseCommand):
    help = "Embed a question and inspect item-scoped Chroma retrieval (no answer generation)."

    def add_arguments(self, parser):
        parser.add_argument("question", help="A quoted natural-language question.")
        parser.add_argument("--item", required=True, metavar="QID", help="Example: --item Q405")
        parser.add_argument("--top-k", type=int, default=5)
        parser.add_argument("--chroma-dir")
        parser.add_argument("--env-file")
        parser.add_argument("--json", action="store_true", dest="as_json")

    def handle(self, *args, **options):
        try:
            if not options["question"].strip() or not options["item"].strip():
                raise ValueError("Question and --item must not be empty.")
            if not 1 <= options["top_k"] <= 20:
                raise ValueError("--top-k must be between 1 and 20.")
            config = IndexConfig.from_django(
                chroma_dir=options["chroma_dir"], env_file=options["env_file"],
            )
            from rag.embeddings import GMSEmbeddings
            from rag.store import ChromaStore

            store = ChromaStore(config, create=False)

            # Lazy construction avoids even requiring a key for unindexed items.
            class QueryEmbeddings:
                def embed_query(self, text):
                    return GMSEmbeddings(config).embed_query(text)

            result = retrieve(
                store, QueryEmbeddings(), options["item"], options["question"], options["top_k"],
            )
        except ImportError:
            raise CommandError("Missing dependency. Install the project requirements.txt first.") from None
        except (ValueError, OSError, RuntimeError) as error:
            raise CommandError(str(error)) from None

        if options["as_json"]:
            self.stdout.write(json.dumps(result, ensure_ascii=False, indent=2))
            return
        self.stdout.write(f"Item: {result['item_id']} / question: {result['question']}")
        self.stdout.write(f"Embedding: {config.model} / dimensions: {config.dimensions}")
        self.stdout.write(f"Indexed chunks: {result['indexed_chunks']}")
        self.stdout.write("\n[Item metadata - basic context]")
        self.stdout.write(result["profile"]["text"])
        self.stdout.write("\n[Retrieved chunks - lower cosine distance means closer]")
        for chunk in result["chunks"]:
            metadata = chunk["metadata"]
            self.stdout.write(
                f"\n#{chunk['rank']} distance={chunk['distance']:.6f} "
                f"{metadata.get('title', '')} / {metadata.get('section', '')}"
            )
            self.stdout.write(f"ID: {chunk['id']} / role: {metadata.get('role', '')}")
            self.stdout.write(f"URL: {metadata.get('source_url', '')}")
            self.stdout.write(
                f"Revision: {metadata.get('revision_id', '')} / "
                f"paragraphs: {metadata.get('paragraph_ids', '')}"
            )
            self.stdout.write(chunk["text"])
        self.stdout.write(self.style.SUCCESS(f"\nSEARCH OK: {len(result['chunks'])} chunks returned."))
