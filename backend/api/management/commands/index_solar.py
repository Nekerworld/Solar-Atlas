from django.core.management.base import BaseCommand, CommandError

from rag.config import IndexConfig
from rag.dataset import build_plans
from rag.indexing import index_plans
from rag.targets import GROUPS, target_ids


class Command(BaseCommand):
    help = "Index completed solar crawling data into persistent Chroma via GMS embeddings."

    def add_arguments(self, parser):
        selection = parser.add_mutually_exclusive_group()
        selection.add_argument("--group", choices=GROUPS, help="Index a registered target group, e.g. new")
        selection.add_argument("--only", nargs="+", metavar="QID", help="Example: --only Q405")
        parser.add_argument("--dry-run", action="store_true", help="Validate/preview; no API or DB writes.")
        parser.add_argument("--include-english-originals", action="store_true", help="Index untranslated English originals with explicit language metadata; no translation API calls.")
        parser.add_argument("--force", action="store_true", help="Re-embed unchanged records (API usage).")
        parser.add_argument("--data-dir")
        parser.add_argument("--chroma-dir")
        parser.add_argument("--env-file")
        parser.add_argument("--chunk-size", type=int)
        parser.add_argument("--chunk-overlap", type=int)
        parser.add_argument("--batch-size", type=int)

    def handle(self, *args, **options):
        try:
            config = IndexConfig.from_django(**{
                key: options[key] for key in (
                    "data_dir", "chroma_dir", "env_file", "chunk_size", "chunk_overlap", "batch_size",
                )
            })
            selected = target_ids(options["group"]) if options.get("group") else options["only"]
            plans, skipped = build_plans(config, selected, include_english_originals=options["include_english_originals"])
            self.stdout.write(f"Model: {config.model} / dimensions: {config.dimensions}")
            self.stdout.write(f"Source: {config.data_dir}")
            self.stdout.write(f"Chroma: {config.chroma_dir}")
            self.stdout.write(f"Chunk size/overlap: {config.chunk_size}/{config.chunk_overlap}")
            for item_id, reason in skipped:
                self.stdout.write(self.style.WARNING(f"SKIP {item_id}: {reason}"))
            for plan in plans:
                for warning in plan.warnings:
                    self.stdout.write(self.style.WARNING(f"NOTE {plan.item_id}: {warning}"))
                self.stdout.write(
                    f"{plan.item_id} {plan.name}: 1 profile, "
                    f"{plan.document_count} documents, {len(plan.chunks)} chunks"
                )
            self.stdout.write(f"TOTAL: {len(plans)} profiles, {sum(len(p.chunks) for p in plans)} chunks")
            if options["dry_run"]:
                self.stdout.write(self.style.SUCCESS("DRY RUN OK (no API calls or Chroma writes)."))
                return

            # Lazy imports let --dry-run work before chromadb is installed.
            from rag.embeddings import GMSEmbeddings
            from rag.store import ChromaStore

            embeddings = GMSEmbeddings(config)
            store = ChromaStore(config)
            totals = index_plans(
                config, plans, store, embeddings,
                progress=self.stdout.write, force=options["force"],
            )
            self.stdout.write(self.style.SUCCESS(
                f"INDEX OK: items={totals['items']}, embedded={totals['embedded']}, "
                f"reused={totals['reused']}, obsolete_deleted={totals['deleted']}"
            ))
            self.stdout.write(
                f"Collection counts: {config.metadata_collection}={store.profiles.count()}, "
                f"{config.document_collection}={store.documents.count()}"
            )
        except (ValueError, OSError, RuntimeError, ImportError) as error:
            if isinstance(error, ImportError):
                message = "Missing dependency. Install the project requirements.txt first."
            else:
                message = str(error)
            raise CommandError(message) from None
