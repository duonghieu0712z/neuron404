# Review the current conversation

Use this workflow when the user invokes neuron404 without arguments. Review the conversation visible to the agent for durable knowledge worth retaining, compare relevant candidates with the store, and present proposals. Invocation alone does not authorize writes.

## Identify useful knowledge

Focus on established decisions and their rationale, reusable explanations, demonstrated corrections, or lessons supported by the conversation. Separate confirmed conclusions from suggestions, unresolved questions, and temporary implementation details. A user's request establishes a requirement, not proof that it has been implemented. Later corrections take precedence over earlier interpretations.

Review only available context; do not claim to inspect other chats or recover messages absent from the context. Do not read unrelated repositories or import external sources merely because a path or URL was mentioned. If no substantive context is available, state that limitation briefly and ask what material to review. If the visible discussion contains nothing worth retaining, say so without manufacturing candidates.

## Compare with stored knowledge

Use the launcher and the [Retrieve workflow](retrieve.md) to search only for the candidate subjects and read plausible matches. Reuse an appropriate Region when suggesting classification; a new subject can justify proposing a new Region. Inspect relevant Region overviews when they clarify scope. Do not load the entire store for a conversation review.

Distinguish a new neuron from an enrichment of an existing neuron, a correction, or an unresolved conflict. Preserve the independence of unrelated projects. Suggest a synapse only when the content establishes a meaningful relationship, not merely shared Region membership. If access fails, identify proposals as unchecked against the store rather than asserting that no matching knowledge exists.

## Present proposals

Respond in the user's language with the proposed knowledge, why it is worth retaining, the intended Region, and whether to create or update a neuron. For an update, identify the existing neuron; for a correction, explain the evidence and qualification. Keep the report proportional to the useful findings and avoid repeating complete transcripts or already stored knowledge without a material change.

Do not create sources, Regions, neurons, synapses, overview articles, or receipts in this workflow. If the user subsequently authorizes saving the proposals, follow [Maintain](maintain.md), reread current revisions, and apply only the accepted scope. Do not repeat the proposal or request confirmation again when that scope is already clear.
