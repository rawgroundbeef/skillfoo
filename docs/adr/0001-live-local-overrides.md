# Keep intentional local overrides live

Skillfoo treats an intentional local Override as live repository policy rather
than pinning one accepted local hash: later safe local edits remain accepted,
the source baseline stays in the lockfile for ownership and registry-state
comparison, and reversal requires an explicit source choice. Hash-pinning was
rejected because it would recreate the original Conflict after every edit and
contradict the product promise that an Override is kept local and excluded
from ordinary sync.
