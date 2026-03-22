import type {
  PubMedInput,
  SemanticScholarInput,
  GeneInfoInput,
  ProteinInteractionsInput,
  ClinicalTrialsInput,
} from "./registry.js";

// ── PubMed (NCBI E-utilities, free, no API key required) ─────────────────────

async function searchPubMed(input: PubMedInput): Promise<string> {
  const maxResults = Math.min(input.max_results ?? 5, 10);

  // Step 1: esearch → get PMID list
  const searchUrl = new URL(
    "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
  );
  searchUrl.searchParams.set("db", "pubmed");
  searchUrl.searchParams.set("term", input.query);
  searchUrl.searchParams.set("retmax", String(maxResults));
  searchUrl.searchParams.set("retmode", "json");
  if (input.since_year) {
    searchUrl.searchParams.set("mindate", `${input.since_year}/01/01`);
    searchUrl.searchParams.set("datetype", "pdat");
  }

  try {
    const searchRes = await fetch(searchUrl).then((r) => r.json());
    const ids: string[] = searchRes.esearchresult?.idlist ?? [];
    if (!ids.length) return "No results found.";

    // Step 2: efetch → get abstracts
    const fetchUrl = new URL(
      "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"
    );
    fetchUrl.searchParams.set("db", "pubmed");
    fetchUrl.searchParams.set("id", ids.join(","));
    fetchUrl.searchParams.set("rettype", "abstract");
    fetchUrl.searchParams.set("retmode", "text");

    const text = await fetch(fetchUrl).then((r) => r.text());
    return text.slice(0, 8000);
  } catch (err) {
    return `Error searching PubMed: ${String(err)}`;
  }
}

// ── Semantic Scholar (free public API) ───────────────────────────────────────

async function searchSemanticScholar(
  input: SemanticScholarInput
): Promise<string> {
  const url = new URL("https://api.semanticscholar.org/graph/v1/paper/search");
  url.searchParams.set("query", input.query);
  url.searchParams.set("limit", String(input.max_results ?? 5));
  url.searchParams.set(
    "fields",
    "title,abstract,year,citationCount,authors,externalIds"
  );

  try {
    const data = await fetch(url, {
      headers: { "User-Agent": "BioAgent/0.1 (research tool)" },
    }).then((r) => r.json());

    return JSON.stringify(data.data ?? [], null, 2).slice(0, 6000);
  } catch (err) {
    return `Error searching Semantic Scholar: ${String(err)}`;
  }
}

// ── NCBI Gene (free) ─────────────────────────────────────────────────────────

async function getGeneInfo(input: GeneInfoInput): Promise<string> {
  const species = input.species ?? "human";
  const searchTerm = `${input.gene_symbol}[Gene Name] AND ${species}[Organism] AND alive[prop]`;
  const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=gene&term=${encodeURIComponent(searchTerm)}&retmode=json&retmax=1`;

  try {
    const searchData = await fetch(searchUrl).then((r) => r.json());
    const geneId = searchData.esearchresult?.idlist?.[0];
    if (!geneId) return `Gene ${input.gene_symbol} not found.`;

    const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=gene&id=${geneId}&retmode=json`;
    const summaryData = await fetch(summaryUrl).then((r) => r.json());
    const gene = summaryData.result?.[geneId];

    return JSON.stringify(
      {
        name: gene?.name,
        description: gene?.description,
        chromosome: gene?.chromosome,
        summary: gene?.summary?.slice(0, 1000),
        mim: gene?.mim,
      },
      null,
      2
    );
  } catch (err) {
    return `Error getting gene info: ${String(err)}`;
  }
}

// ── STRING DB (free) ─────────────────────────────────────────────────────────

async function getProteinInteractions(
  input: ProteinInteractionsInput
): Promise<string> {
  const url = new URL("https://string-db.org/api/json/interaction_partners");
  url.searchParams.set("identifier", input.gene_symbol);
  url.searchParams.set("species", "9606"); // human
  url.searchParams.set("limit", String(input.max_interactions ?? 10));
  url.searchParams.set("required_score", String(input.min_score ?? 400));

  try {
    const data = await fetch(url).then((r) => r.json());
    return JSON.stringify(
      (data as Record<string, unknown>[]).map((d) => ({
        partner: d.preferredName_B,
        score: d.score,
        textmining: d.textmining,
        experiments: d.experiments,
        coexpression: d.coexpression,
      })),
      null,
      2
    ).slice(0, 4000);
  } catch (err) {
    return `Error getting protein interactions: ${String(err)}`;
  }
}

// ── ClinicalTrials.gov (v2 API, free) ────────────────────────────────────────

async function searchClinicalTrials(
  input: ClinicalTrialsInput
): Promise<string> {
  const url = new URL("https://clinicaltrials.gov/api/v2/studies");
  url.searchParams.set("query.cond", input.condition);
  if (input.intervention)
    url.searchParams.set("query.intr", input.intervention);
  if (input.status && input.status !== "ALL")
    url.searchParams.set("filter.overallStatus", input.status);
  url.searchParams.set("pageSize", String(input.max_results ?? 5));
  url.searchParams.set(
    "fields",
    "NCTId,BriefTitle,OverallStatus,Phase,BriefSummary,StartDate,CompletionDate"
  );

  try {
    const data = await fetch(url).then((r) => r.json());
    return JSON.stringify(data.studies ?? [], null, 2).slice(0, 5000);
  } catch (err) {
    return `Error searching clinical trials: ${String(err)}`;
  }
}

// ── Tool executor ────────────────────────────────────────────────────────────

export async function executeTool(
  name: string,
  input: Record<string, unknown>
): Promise<string> {
  switch (name) {
    case "search_pubmed":
      return searchPubMed(input as PubMedInput);
    case "search_semantic_scholar":
      return searchSemanticScholar(input as SemanticScholarInput);
    case "get_gene_info":
      return getGeneInfo(input as GeneInfoInput);
    case "get_protein_interactions":
      return getProteinInteractions(input as ProteinInteractionsInput);
    case "search_clinical_trials":
      return searchClinicalTrials(input as ClinicalTrialsInput);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}