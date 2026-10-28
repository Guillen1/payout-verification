# Independent reviews of the shortlist

As of 2026-10-27. Three agents ran in parallel with different briefs and no access to each other's work.
A fourth read all three and wrote the decision. This page summarizes what each found and how the
disagreements were settled.

## What each agent concluded

### Skeptic: "keep the company, change the workflow"

- **Statement matching is a product category.** Applied Recon ships inside Applied Epic, Vertafore has a
  Reconciliation Agent, Ascend was named accounting partner for two agency networks in 2026, and Comulate,
  Synatic and others sell similar tools.
- **The agency management system covers part of it.** EZLynx has imported CSV commission statements with
  a reusable per-carrier mapping since 2016, and IVANS delivers electronic statements for participating
  carriers.
- **What is left uncovered:** PDF-only carriers, checking paid against expected (the AMS matches lines
  but does not say the carrier underpaid), and anything above the single agency: network splits,
  overrides and contingent bonus programs.
- **An unverified premise:** nothing public says whether carriers pay the network centrally or pay
  agencies directly. The reframed design has to work either way.
- **Monitoring gap:** production statements have no labels. Human overrides in the review queue are the
  only production accuracy signal, so they must feed the eval set.

### Evaluator: "keep it, and lead with the bonus programs"

- **Business case:** recovered revenue beats saved hours, because it reaches earnings almost directly.
  Industry sources put commission leakage at 1 to 5 percent (vendor figures, conservative end used).
- **Bonus programs** are the largest single payments of the year, often miscalculated, and untouched by
  any AMS feature.
- **The convincing moment** is breaking the system on purpose and showing the detection, the hold, the
  review item and the eval failure, rather than describing them.
- **Scope advice:** two or three formats built to production quality beat eight built to demo quality.

### Researcher: "on evidence alone, a different company"

- Researched 26 of the 27 companies, citing a source for each claim.
- Ranked **Reliable Medical funding-packet readiness** first: the company named the priority publicly, a
  2026 Medicare rule put a number on packet quality, and trade press attributes failures to documents
  "missing or dated wrong", which is what extraction plus rules catches.
- Ranked **AAI commission reconciliation** second and **Axxiom inspection compliance** third.
- Disagreed with the shortlist on using healthcare remittances as the second-company example, since that
  file format is a public standard.

## How the disagreements were settled

| Question                        | Positions                                                                               | Resolution                                                        | Basis                                                                                                                                                             |
| ------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Which workflow at which company | Skeptic and evaluator: AAI, reframed. Researcher: Reliable Medical.                     | AAI payout and bonus verification; Reliable kept as the alternate | Judgment: the builder can verify payer rules in insurance, not in Medicare documentation, within the time available. On evidence alone, the researcher was right. |
| Second-company example          | Original: healthcare remittances. Skeptic and researcher: weak, public standard format. | Retailer deductions, shipped as a second tenant config            | Evidence: both agents independently identified the same flaw                                                                                                      |
| Inspection compliance at Axxiom | Shortlist: no evidence. Researcher: live postings.                                      | Added to the shortlist, not built                                 | Evidence for the ranking; judgment for not building it                                                                                                            |
| Is the AAI pain verified        | Two agents could not load the company site                                              | Verified: the orchestrator fetched the blog post directly         | Evidence, with the source passed to the synthesis                                                                                                                 |

## Sources the reviews relied on

- Applied Recon: https://int.appliedsystems.com/en-us/solutions/for-agents/financial-management/applied-recon/
- EZLynx commission statement import: https://www.ezlynx.com/blog/import-commission-statements/
- IVANS direct bill commission download: https://int.ivans.com/globalassets/all-documents/resources/brochures-data-sheets/ivans/ivans_dbcsd_agents.pdf
- Vertafore reconciliation: https://www.vertafore.com/resources/blog/how-ai-changing-insurance-reconciliation-workflows
- Ascend and an agency network: https://www.streetinsider.com/PRNewswire/Ascend+Named+ARM+Internationals+Exclusive+Accounting+Automation+Partner/26150449.html
- Commission leakage (vendor): https://intglobal.com/blogs/the-1-5-revenue-leak-hidden-in-insurance-commissions/
- HME News on documentation failures: https://www.hmenews.com/article/affirmdme-offers-guide-for-new-codes-added-to-prior-auth-list
