"""Index prevalidated plans. No Django or API calls at module import."""


def index_plans(config, plans, store, embeddings, progress=lambda message: None, force=False):
    totals = {"embedded": 0, "reused": 0, "deleted": 0, "items": 0}
    for plan in plans:
        progress(f"[{plan.item_id}] {plan.name}: indexing {len(plan.chunks)} chunks")
        groups = [(store.profiles, [plan.profile]), (store.documents, plan.chunks)]
        snapshots = []
        for collection, records in groups:
            existing = store.existing(collection, plan.item_id)
            snapshots.append((collection, existing, records))
            pending = [r for r in records if force or
                       (existing.get(r.id) or {}).get("record_hash") != r.fingerprint]
            totals["reused"] += len(records) - len(pending)
            for start in range(0, len(pending), config.batch_size):
                batch = pending[start:start + config.batch_size]
                vectors = embeddings.embed_documents([r.text for r in batch])
                store.upsert(collection, batch, vectors)
                totals["embedded"] += len(batch)
                progress(f"  {collection.name}: saved {start + len(batch)}/{len(pending)}")
        # Only reconcile this item after BOTH collections finished successfully.
        # Upsert batches persist immediately: interrupted runs are resumable.
        for collection, existing, records in snapshots:
            totals["deleted"] += store.delete_obsolete(
                collection, existing, records, config.batch_size,
            )
        totals["items"] += 1
    return totals
