# 0002. Every statement ties out before anything is paid

**Status:** accepted, 2026-10-28.

**Context.** A misread amount, a dropped line or a wrong column becomes a wrong payout unless
something catches it.

**Decision.** The lines read from a statement must add up to the total the carrier printed, to the
cent, or the whole statement is held and nothing from it is allocated. Holding is per carrier; the
others close.

**Considered.** Tolerating small differences: it would hide exactly the errors that matter, a single
misread line.

**Consequences.** Most reading errors stop at the statement instead of reaching an agency. A person
sees a hold, not a wrong number.
