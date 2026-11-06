# ADR-0005: Canada-first launch, priced in Canadian dollars

Status: Accepted, by the project owner (2026-11-05)

## Context
The PRD names Canada and Nigeria as primary markets. The owner has decided that, for now, Biqbaq serves Nigerians in Canada only, with money displayed in Canadian dollars.

## Decision
- All prices are shown in CAD.
- Sellers are Nigerians based in Canada only. A seller physically based in Nigeria cannot list for now. Each seller's city is shown on their listings.
- The site does not offer a seller-location choice between countries.
- Cargo listings still run from Canada to Nigeria (PRD §8). That is the destination of a shipment, not a market.
- This narrows the PRD for now rather than removing Nigeria for good. The PRD itself stays unchanged as the baseline.

## Consequences
- Keep the data ready for later: products store a currency and sellers a country, and price sorting never compares across currencies.
- The Nigeria-related payment question in BD-12 can wait, so provider evaluation can start with Canadian eligibility.
- Mixed-currency handling (Q-14) is deferred.

## Still to confirm with the owner
- How "Nigerian" is applied at seller approval. Being based in Canada can be checked from an address. Making nationality or origin a condition of selling is a different matter, and needs legal advice under Canadian human rights law before it becomes a rule.
- Whether the exchange-rate feature (PRD §20.3) is still wanted for this launch.
