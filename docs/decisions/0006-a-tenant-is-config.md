# 0006. A tenant is config, including its words

**Status:** accepted, 2026-10-30.

**Context.** The second company is a brand group checking retailer remittances. The money flow is the
same; the words are not.

**Decision.** A tenant is a directory: counterparties, rates, splits, layouts, bonus programs and a
`vocabulary` of the words people and the model read. The engine has no tenant-specific code. The
agency network's words are the defaults.

**Considered.** A copy of the engine per business, or renaming the domain to abstract words: the first
doubles the code to maintain; the second makes the code harder to read for the domain it was built on.

**Consequences.** `tenants/brand-group/` runs on the same code, and both tenants are tested end to end.
Because the defaults reproduce the agency network's prompts exactly, its recordings stayed valid.
