# Architecture and storage

## Terminology

**Neuron** is a knowledge unit, **Synapse** is a semantic relationship, **Region** groups neurons by knowledge context, and **Network** is the exploration view. Region membership does not require synapses. These names are neuroscience-inspired product metaphors, not a biological simulation. Use neuroscience terminology consistently for new product concepts. Region membership uses `regions` throughout the schema, frontmatter, catalog, and CLI; search uses `--region`.

## Storage

- `content/neurons/<id>.md`: current neuron bodies and frontmatter; authoritative knowledge.
- `content/sources/<sha256>.json`: immutable evidence snapshots with source URI, optional locator, and capture time.
- `content/history/<id>/<revision>.md`: exact original and subsequent versions saved by updates.
- `content/operations.jsonl`: append-only write receipts with current and previous revisions.
- `content/regions.json`: Region definitions; membership is neuron metadata.
- `content/regions/<id>.md`: authored Region overviews with supporting neuron revisions and links.
- `content/history/region-overviews/<id>/<revision>.md`: preserved Region article revisions.
- `content/history/regions/<revision>.json`: exact catalog snapshots before adding Regions.
- `content/history/storage-migrations/regions.json`: migration receipt with exact files before and after the terminology change.
- SQLite: derived neuron, relation, and full-text indexes. Rebuild from Markdown with `pnpm neuron index --rebuild`.

Personal content and databases are ignored by Git. Application Git history is not a backup of personal knowledge. Keep private backups of the content directory; rebuilding SQLite cannot recreate lost source files or neuron revisions.

Local web and CLI commands derive the data directory from the operating system home directory: `~/.neuron404`. SQLite is always `neuron404.db` and knowledge files are under `content/` in that directory. No path configuration is required. Docker sets `NEURON404_DATA_DIR=/data` internally to use its bind mount; this optional root override also supports other deployment locations.

Existing Markdown remains valid without aliases, structured sources, or lifecycle fields. Its default lifecycle is `active`, which does not imply verified or current knowledge. The storage refactor does not rewrite legacy bodies, invent source snapshots, or infer replacements.

Network renders actual neurons and typed synapses. Regions define labeled background areas and layout forces that keep members near one another, including isolated neurons. A neuron can belong to multiple regions. Each Region has a draggable, point-top hexagon at the center of its member layout. It opens the authored overview in the sidebar, influences its members when dragged, and always shows its full label, including when ordinary neuron labels are hidden. These are visual metadata markers, excluded from neuron and synapse counts; no membership edges or synthetic knowledge are stored. Grouping does not create semantic relationships. Hovering or selecting a neuron shows traveling pulses along its actual synapses in their stored source-to-target direction. Small pulses render above the lines in matching colors; focused dashed membership lines use the same effect. Pulses stop when motion is paused or the tab is hidden, and respect reduced-motion preferences. A separate dashed overlay can show Region membership: Hidden, Automatic (hover/selection), or Show all. An icon button cycles through the three modes; its tooltip names the current mode. The default is Automatic and the choice is saved in the browser. These lines have no arrows, render behind synapses, and do not affect counts, neighbor relationships, or layout forces.

The Network lives at `/network`; the former `/neurons/network` URL redirects there. Header search on Network emphasizes matches in place using the same indexed prefix matching as the Neurons list. Unrelated neurons and their connections fade, as they do during hover; all nodes, layout positions and totals remain present. While a query is active, search emphasis takes priority over the selection retained in the sidebar. Clearing search restores emphasis around the selected neuron and its connections. In Network discussions, hiding unrelated neurons means fading them rather than removing them from view. The shared detail sidebar keeps its selection across these views; background clicks inside their content surfaces dismiss it, while header and control interactions preserve it.
